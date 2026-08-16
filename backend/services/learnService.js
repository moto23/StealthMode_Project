const Course = require('../models/Course');
const Enrolled = require('../models/Enrolled');
const Progress = require('../models/Progress');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');
const muxService = require('./muxService');
const muxAssetService = require('./muxAssetService');

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);

// Authoritative access gate: a user may learn a course only if they have an
// Enrolled record (free enrollment OR verified paid purchase both create one).
const assertEnrolled = async (userId, courseId) => {
  const enrolled = await Enrolled.exists({ userId, courseId });
  if (!enrolled) {
    throw ApiError.forbidden('You must be enrolled in this course to access it');
  }
};

// Flatten a course's lessons in curriculum order; strip protected video handles
// for non-preview lessons (video playback is a later slice — never leak ids).
const buildCurriculum = (course) => {
  const sections = Array.isArray(course.sections) ? [...course.sections].sort(byOrder) : [];
  return sections.map((s) => ({
    _id: s._id,
    title: s.title,
    lessons: (Array.isArray(s.lessons) ? [...s.lessons].sort(byOrder) : []).map((l) => ({
      _id: l._id,
      title: l.title,
      duration: l.duration,
      isPreview: Boolean(l.isPreview),
    })),
  }));
};

const validLessonIdSet = (course) => {
  const set = new Set();
  (course.sections || []).forEach((s) =>
    (s.lessons || []).forEach((l) => set.add(String(l._id)))
  );
  return set;
};

// Percentage is ALWAYS derived server-side: completed ∩ real-lessons / total.
const computePercent = (completedIds, validSet) => {
  const total = validSet.size;
  if (total === 0) return 0;
  const done = completedIds.filter((id) => validSet.has(String(id))).length;
  return Math.round((done / total) * 100);
};

const findOrInitProgress = async (userId, courseId) => {
  const existing = await Progress.findOne({ userId, courseId });
  return existing || new Progress({ userId, courseId, completedLessonIds: [] });
};

// Full learn payload for an enrolled user: curriculum + their progress + resume.
const getLearnData = async (userId, courseId) => {
  assertValidObjectId(courseId, 'course id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  const validSet = validLessonIdSet(course);
  const progress = await Progress.findOne({ userId, courseId });
  const completed = progress ? progress.completedLessonIds.map(String) : [];

  return {
    courseId: String(course._id),
    title: course.title,
    sections: buildCurriculum(course),
    completedLessonIds: completed.filter((id) => validSet.has(id)),
    currentLessonId: progress && progress.currentLessonId ? String(progress.currentLessonId) : null,
    totalLessons: validSet.size,
    percent: computePercent(completed, validSet),
  };
};

// Mark a lesson complete (default) or incomplete. Validates the lesson belongs
// to the course; $addToSet guarantees no double-counting.
const setLessonComplete = async (userId, courseId, lessonId, completed = true) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  const validSet = validLessonIdSet(course);
  if (!validSet.has(String(lessonId))) {
    throw ApiError.badRequest('Lesson does not belong to this course');
  }

  const progress = await findOrInitProgress(userId, courseId);
  const has = progress.completedLessonIds.some((id) => String(id) === String(lessonId));
  if (completed && !has) {
    progress.completedLessonIds.push(lessonId);
  } else if (!completed && has) {
    progress.completedLessonIds = progress.completedLessonIds.filter(
      (id) => String(id) !== String(lessonId)
    );
  }
  await progress.save();

  const completedIds = progress.completedLessonIds.map(String);
  return {
    completedLessonIds: completedIds,
    percent: computePercent(completedIds, validSet),
    totalLessons: validSet.size,
  };
};

// Persist the resume point (current lesson).
const setCurrentLesson = async (userId, courseId, lessonId) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  if (!validLessonIdSet(course).has(String(lessonId))) {
    throw ApiError.badRequest('Lesson does not belong to this course');
  }

  const progress = await findOrInitProgress(userId, courseId);
  progress.currentLessonId = lessonId;
  await progress.save();
  return { currentLessonId: String(lessonId) };
};

// Locate a lesson within a course's curriculum. Returns the lesson subdoc (with
// its protected `video`) or null. This is also how we prove a lesson BELONGS to
// the requested course — a lesson id from another course yields null → 404.
const findLessonInCourse = (course, lessonId) => {
  for (const section of course.sections || []) {
    for (const lesson of section.lessons || []) {
      if (String(lesson._id) === String(lessonId)) return lesson;
    }
  }
  return null;
};

// Issue a short-lived Mux signed playback token for a single lesson.
// Authorization ladder (the route is already behind `protect` → 401 if no JWT):
//   1. Validate ids (400) and that the course + lesson exist and the lesson
//      belongs to THIS course (404).
//   2. Preview lessons (isPreview) are playable by any authenticated user.
//   3. Non-preview (protected) lessons require enrollment (403 otherwise).
//   4. Only then mint a token from the server-held signing key. The Mux ASSET
//      id and signing key NEVER leave the server — the client receives only the
//      playbackId (inert without a token) + the temporary token.
const getLessonPlayback = async (userId, courseId, lessonId) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const lesson = findLessonInCourse(course, lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found in this course');

  // Preview lessons bypass the enrollment gate; protected lessons do not.
  if (!lesson.isPreview) {
    await assertEnrolled(userId, courseId);
  }

  const video = lesson.video || {};

  // Phase 8.5: external embeddable source (e.g. YouTube). No signed token — the
  // browser loads the provider's official iframe. Still gated (auth + preview/
  // enrollment above) so protected embeds aren't exposed to non-enrolled users.
  // The Mux signed-playback path below is untouched.
  if (video.provider && video.provider !== 'mux' && (video.embedUrl || video.sourceId)) {
    if (!video.embeddable || !video.embedUrl) {
      throw ApiError.notFound('This lesson video is not available');
    }
    return {
      provider: video.provider,
      embedUrl: video.embedUrl,
      sourceId: video.sourceId,
      url: video.url,
      isPreview: Boolean(lesson.isPreview),
      lessonId: String(lesson._id),
      title: lesson.title,
      captions: [],
      hasTranscript: false,
    };
  }

  const playbackId = video.playbackId;
  if (!playbackId) {
    throw ApiError.notFound('This lesson has no video yet');
  }

  // Size the token to outlive the lesson (Mux: exp > now + duration).
  const { token, expiresIn } = muxService.signPlaybackToken(playbackId, {
    type: 'video',
    contentDuration: lesson.duration,
  });

  // Caption availability (safe subset — no internal track ids leaked here).
  const captions = Array.isArray(lesson.video.captions)
    ? lesson.video.captions.map((c) => ({
        languageCode: c.languageCode,
        name: c.name,
        status: c.status,
      }))
    : [];

  return {
    provider: 'mux',
    playbackId,          // signed-policy id: safe to expose, useless without token
    token,               // short-lived JWT (client refreshes; never persisted)
    expiresIn,           // seconds until the token expires
    isPreview: Boolean(lesson.isPreview),
    lessonId: String(lesson._id),
    title: lesson.title,
    captions,            // [{ languageCode, name, status }] — CC handled by the player
    hasTranscript: captions.some((c) => c.status === 'ready'),
  };
};

// Plain-text transcript for a lesson, fetched from Mux ONLY when a caption
// track is actually ready (never fabricated). Same authorization as playback:
// preview lessons are open to any logged-in user; protected lessons require
// enrollment. Returns { available, language, name, text }.
const getLessonTranscript = async (userId, courseId, lessonId) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const lesson = findLessonInCourse(course, lessonId);
  if (!lesson) throw ApiError.notFound('Lesson not found in this course');
  if (!lesson.isPreview) await assertEnrolled(userId, courseId);

  const video = lesson.video || {};
  const track = (video.captions || []).find((c) => c.status === 'ready' && c.trackId);
  if (!video.playbackId || !track) {
    throw ApiError.notFound('No transcript available for this lesson');
  }

  // Signed playback needs a token to fetch the transcript; public does not.
  const policy = video.policy || 'signed';
  let token;
  if (policy !== 'public') {
    token = muxService.signPlaybackToken(video.playbackId, {
      type: 'video',
      contentDuration: lesson.duration,
    }).token;
  }

  const text = await muxAssetService.getTranscriptText(video.playbackId, track.trackId, token);
  return {
    available: true,
    language: track.languageCode || null,
    name: track.name || null,
    text,
  };
};

// Progress summary for My Learning: { [courseId]: percent } across the user's
// enrolled courses. Percentages computed server-side from real lessons.
const getProgressSummary = async (userId) => {
  const enrollments = await Enrolled.find({ userId }).select('courseId').lean();
  const courseIds = enrollments.map((e) => e.courseId).filter(Boolean);
  if (courseIds.length === 0) return { progress: {} };

  const [courses, progresses] = await Promise.all([
    Course.find({ _id: { $in: courseIds } }).select('sections').lean(),
    Progress.find({ userId, courseId: { $in: courseIds } }).lean(),
  ]);

  const progressByCourse = new Map(progresses.map((p) => [String(p.courseId), p]));
  const result = {};
  courses.forEach((course) => {
    const validSet = new Set();
    (course.sections || []).forEach((s) =>
      (s.lessons || []).forEach((l) => validSet.add(String(l._id)))
    );
    const p = progressByCourse.get(String(course._id));
    const completed = p ? p.completedLessonIds.map(String) : [];
    result[String(course._id)] = computePercent(completed, validSet);
  });
  return { progress: result };
};

module.exports = {
  getLearnData,
  setLessonComplete,
  setCurrentLesson,
  getProgressSummary,
  getLessonPlayback,
  getLessonTranscript,
};
