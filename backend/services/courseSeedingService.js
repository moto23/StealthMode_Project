const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');
const courseService = require('./courseService');
const curriculumGenerator = require('./curriculumGeneratorService');
const videoSourceService = require('./videoSourceService');

/**
 * Phase 8.5 — automated course-content seeding (orchestrator).
 *
 * Reuses the EXISTING curriculum structures and write path (courseService
 * .replaceCurriculum → validateCurriculum → Course.sections). It never creates a
 * parallel system, never rehosts video, and never fabricates metadata — videos
 * come from videoSourceService (verified embeddable) and durations from real
 * provider data.
 *
 * Modes:
 *  - 'fill' (default): idempotent. Matches generated lessons by `autoKey`;
 *    fills only missing/invalid videos; preserves manual lessons and any
 *    already-valid video (incl. admin Mux uploads); never duplicates.
 *  - 'replace': admin-explicit full regeneration of the curriculum.
 */

const formatDuration = (seconds) => {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};

const videoFromCandidate = (cand) =>
  cand
    ? {
        provider: cand.provider,
        sourceId: cand.sourceId,
        url: cand.url,
        embedUrl: cand.embedUrl,
        embeddable: Boolean(cand.embeddable),
        license: cand.license,
        sourceTitle: cand.sourceTitle,
        duration: cand.duration,
      }
    : undefined;

// Build the freshly-desired sections from the blueprint, attaching a found
// embeddable video (or leaving it missing) per lesson.
const buildDesiredSections = async (course, { preferCreativeCommon }) => {
  const blueprint = curriculumGenerator.generateCurriculum(course);
  const sections = [];
  for (const sec of blueprint) {
    const lessons = [];
    for (const l of sec.lessons) {
      // Sequential (not parallel) to stay gentle on provider rate limits.
      // eslint-disable-next-line no-await-in-loop
      const cand = await videoSourceService.pickBest(l.searchQuery, { preferCreativeCommon });
      const video = videoFromCandidate(cand);
      lessons.push({
        title: l.title,
        description: l.description,
        autoKey: l.autoKey,
        generated: true,
        video,
        duration: video && video.duration ? formatDuration(video.duration) : undefined,
      });
    }
    sections.push({ title: sec.title, autoKey: sec.autoKey, lessons });
  }
  return sections;
};

// Locate a generated lesson (by autoKey) anywhere in the merged sections.
const findLessonByKey = (sections, autoKey) => {
  for (const s of sections) {
    for (const l of s.lessons || []) {
      if (l.autoKey && l.autoKey === autoKey) return l;
    }
  }
  return null;
};

// Idempotent merge into existing curriculum. Never removes/duplicates; only
// fills missing/invalid videos on matched generated lessons.
const mergeFill = (existingSections, desiredSections) => {
  const merged = JSON.parse(JSON.stringify(existingSections || []));
  desiredSections.forEach((desiredSec) => {
    let targetSec = merged.find((s) => s.autoKey && s.autoKey === desiredSec.autoKey);
    if (!targetSec) {
      targetSec = { title: desiredSec.title, autoKey: desiredSec.autoKey, lessons: [] };
      merged.push(targetSec);
    }
    desiredSec.lessons.forEach((desiredLesson) => {
      const existing = findLessonByKey(merged, desiredLesson.autoKey);
      if (existing) {
        // Preserve a valid video (Mux upload or prior embed); fill otherwise.
        if (!courseService.hasValidVideo(existing.video) && desiredLesson.video) {
          existing.video = desiredLesson.video;
          existing.duration = desiredLesson.duration;
        }
        // Title/description are preserved (admin edits survive).
      } else {
        targetSec.lessons = targetSec.lessons || [];
        targetSec.lessons.push(desiredLesson);
      }
    });
  });
  return merged;
};

// Serialize merged sections into the curriculum PUT payload shape (the existing
// validateCurriculum then normalizes/persists them).
const toCurriculumPayload = (sections) =>
  sections.map((s) => ({
    title: s.title,
    autoKey: s.autoKey,
    generated: s.autoKey ? true : s.generated,
    lessons: (s.lessons || []).map((l) => ({
      title: l.title,
      description: l.description,
      duration: l.duration,
      isPreview: Boolean(l.isPreview),
      generated: l.generated,
      autoKey: l.autoKey,
      video: l.video,
    })),
  }));

// Per-lesson status for the admin report.
const lessonStatus = (l) => {
  const v = l.video;
  if (!v) return l.generated ? 'missing-video' : 'no-video';
  if (courseService.isExternalVideo(v)) {
    if (!v.embeddable || !v.embedUrl) return 'not-embeddable';
    return 'ok';
  }
  if (v.playbackId) return v.status && v.status !== 'ready' ? 'processing' : 'ok';
  return 'missing-video';
};

const buildReport = (mode, curriculum) => {
  const lessons = [];
  (curriculum.sections || []).forEach((s) => {
    (s.lessons || []).forEach((l) => {
      const v = l.video || {};
      lessons.push({
        section: s.title,
        title: l.title,
        generated: Boolean(l.generated),
        provider: v.provider || null,
        source: v.url || null,
        embeddable: courseService.isExternalVideo(v) ? Boolean(v.embeddable) : undefined,
        duration: l.duration || null,
        status: lessonStatus(l),
      });
    });
  });
  return {
    mode,
    providerConfigured: videoSourceService.isConfigured(),
    sectionCount: (curriculum.sections || []).length,
    lessonCount: lessons.length,
    generatedCount: lessons.filter((l) => l.generated).length,
    withVideoCount: lessons.filter((l) => l.status === 'ok').length,
    missingVideo: lessons
      .filter((l) => l.status === 'missing-video' || l.status === 'not-embeddable')
      .map((l) => ({ section: l.section, title: l.title, status: l.status })),
    lessons,
  };
};

/**
 * Auto-generate (or regenerate) a course's curriculum + videos.
 * @returns {Promise<{ report, curriculum }>}
 */
const autoGenerate = async (courseId, { mode = 'fill', preferCreativeCommon = true } = {}) => {
  assertValidObjectId(courseId, 'course id');
  if (!['fill', 'replace'].includes(mode)) {
    throw ApiError.badRequest("mode must be 'fill' or 'replace'");
  }
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const desired = await buildDesiredSections(course, { preferCreativeCommon });
  const existing = course.toObject().sections || [];
  const merged = mode === 'replace' ? desired : mergeFill(existing, desired);

  // Persist through the EXISTING validated curriculum write path.
  await courseService.replaceCurriculum(courseId, toCurriculumPayload(merged));

  // Re-read the authoritative saved curriculum for the report.
  const curriculum = await courseService.getCurriculum(courseId);
  return { report: buildReport(mode, curriculum), curriculum };
};

module.exports = { autoGenerate, formatDuration, mergeFill, buildReport };
