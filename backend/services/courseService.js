const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');

const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const generateUniqueSlug = async (title) => {
  const base = slugify(title) || 'course';
  let slug = base;
  let n = 1;
  // Ensure uniqueness against the collection.
  while (await Course.findOne({ slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
};

const validatePrice = (price) => {
  if (price == null) return;
  if (typeof price !== 'number' || Number.isNaN(price) || price < 0) {
    throw ApiError.badRequest('price must be a non-negative number');
  }
};

// originalPrice is optional; when present it must be a non-negative number.
// It is a display-only compare-at price and never affects the charged amount.
const validateOriginalPrice = (originalPrice) => {
  if (originalPrice == null) return;
  if (typeof originalPrice !== 'number' || Number.isNaN(originalPrice) || originalPrice < 0) {
    throw ApiError.badRequest('originalPrice must be a non-negative number');
  }
};

// ---- Curriculum helpers (Phase 7, Slice 1; extended Phase 8 / 8.5) ----

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);

// Approved external (embeddable) video providers. Anything else is rejected by
// the publish gate. Kept tiny and explicit so we never store arbitrary embeds.
const ALLOWED_EXTERNAL_PROVIDERS = ['youtube'];

const isExternalVideo = (v) =>
  Boolean(v && v.provider && v.provider !== 'mux' && (v.sourceId || v.embedUrl || v.url));

// A lesson video counts as "valid" (used by idempotent seeding to decide
// whether to (re)fill) when it is a usable Mux asset OR a verified embeddable
// external source.
const hasValidVideo = (v) => {
  if (!v) return false;
  if (isExternalVideo(v)) {
    return Boolean(v.embeddable && v.embedUrl && ALLOWED_EXTERNAL_PROVIDERS.includes(v.provider));
  }
  return Boolean(v.playbackId && v.status !== 'errored');
};

// Normalize an incoming lesson video object, keeping only recognized fields and
// only when present. Backward compatible with Slice 1 (provider/assetId/
// playbackId) and additive for Phase 8 (uploadId/status/policy/duration/
// captions) and Phase 8.5 (external embed: sourceId/url/embedUrl/embeddable/
// license/sourceTitle). Returns undefined when there is nothing to store.
const normalizeVideo = (video) => {
  if (!video || typeof video !== 'object') return undefined;
  const out = {};
  if (video.provider != null) out.provider = String(video.provider);
  if (video.assetId != null) out.assetId = String(video.assetId);
  if (video.playbackId != null) out.playbackId = String(video.playbackId);
  if (video.uploadId != null) out.uploadId = String(video.uploadId);
  if (video.status != null) out.status = String(video.status);
  if (video.policy != null) out.policy = String(video.policy);
  if (video.sourceId != null) out.sourceId = String(video.sourceId);
  if (video.url != null) out.url = String(video.url);
  if (video.embedUrl != null) out.embedUrl = String(video.embedUrl);
  if (video.embeddable != null) out.embeddable = Boolean(video.embeddable);
  if (video.license != null) out.license = String(video.license);
  if (video.sourceTitle != null) out.sourceTitle = String(video.sourceTitle);
  if (video.duration != null && !Number.isNaN(Number(video.duration))) {
    out.duration = Number(video.duration);
  }
  if (Array.isArray(video.captions)) {
    const caps = video.captions
      .filter((c) => c && typeof c === 'object')
      .map((c) => ({
        trackId: c.trackId != null ? String(c.trackId) : undefined,
        languageCode: c.languageCode != null ? String(c.languageCode) : undefined,
        name: c.name != null ? String(c.name) : undefined,
        status: c.status != null ? String(c.status) : undefined,
      }));
    if (caps.length) out.captions = caps;
  }
  return Object.keys(out).length ? out : undefined;
};

// Serialize a course for PUBLIC consumption: sort curriculum by order and
// STRIP protected video handles (assetId/playbackId) from every non-preview
// lesson so they are never exposed to unauthorized clients. Preview lessons
// keep their video so the free preview can play. Accepts a Mongoose doc or a
// plain object; returns a plain object.
const toPublicCourse = (course) => {
  const obj = typeof course.toObject === 'function' ? course.toObject() : { ...course };
  const sections = Array.isArray(obj.sections) ? obj.sections : [];
  obj.sections = [...sections].sort(byOrder).map((section) => ({
    ...section,
    lessons: (Array.isArray(section.lessons) ? [...section.lessons] : [])
      .sort(byOrder)
      .map((lesson) => {
        const safe = { ...lesson };
        if (lesson.isPreview && lesson.video) {
          const v = lesson.video;
          if (isExternalVideo(v)) {
            // Preview external embed: the embed URL/id are not secret, but we
            // only expose them for preview lessons (protected embeds stay gated
            // behind the authorized playback endpoint, preserving paid access).
            safe.video = {
              provider: v.provider,
              sourceId: v.sourceId,
              url: v.url,
              embedUrl: v.embedUrl,
              embeddable: v.embeddable,
              license: v.license,
            };
          } else {
            // Preview Mux: expose ONLY what a client needs to play (inert
            // without a signed token). Strip protected handles + caption ids.
            safe.video = {
              provider: v.provider,
              playbackId: v.playbackId,
              policy: v.policy,
            };
            if (Array.isArray(v.captions)) {
              safe.video.hasCaptions = v.captions.some((c) => c.status === 'ready');
            }
          }
        } else {
          // Protected lessons never expose any video handle (Mux or external).
          delete safe.video;
        }
        return safe;
      }),
  }));
  return obj;
};

// Validate an incoming curriculum payload (admin). Throws 400 on any problem.
// Returns a normalized sections array with deterministic order fields.
const validateCurriculum = (sections) => {
  if (!Array.isArray(sections)) {
    throw ApiError.badRequest('sections must be an array');
  }
  return sections.map((section, si) => {
    if (!section || typeof section !== 'object') {
      throw ApiError.badRequest('each section must be an object');
    }
    if (!section.title || !String(section.title).trim()) {
      throw ApiError.badRequest('each section requires a title');
    }
    if (section.lessons != null && !Array.isArray(section.lessons)) {
      throw ApiError.badRequest('section lessons must be an array');
    }
    const lessons = (section.lessons || []).map((lesson, li) => {
      if (!lesson || typeof lesson !== 'object') {
        throw ApiError.badRequest('each lesson must be an object');
      }
      if (!lesson.title || !String(lesson.title).trim()) {
        throw ApiError.badRequest('each lesson requires a title');
      }
      return {
        title: String(lesson.title).trim(),
        order: li,
        duration: lesson.duration != null ? String(lesson.duration) : undefined,
        isPreview: Boolean(lesson.isPreview),
        description: lesson.description != null ? String(lesson.description) : undefined,
        generated: lesson.generated != null ? Boolean(lesson.generated) : undefined,
        autoKey: lesson.autoKey != null ? String(lesson.autoKey) : undefined,
        video: normalizeVideo(lesson.video),
      };
    });
    return {
      title: String(section.title).trim(),
      order: si,
      autoKey: section.autoKey != null ? String(section.autoKey) : undefined,
      generated: section.generated != null ? Boolean(section.generated) : undefined,
      lessons,
    };
  });
};

// Public catalog (backward-compatible raw array), with protected video stripped.
// Hides ONLY explicit drafts: `status !== 'draft'` also matches legacy courses
// that predate the publishing field (they have no `status`), so existing
// published courses remain visible.
const listCourses = async () => {
  const courses = await Course.find({ status: { $ne: 'draft' } });
  return courses.map(toPublicCourse);
};

// Admin management list — ALL courses (incl. drafts) with full editable fields
// + status. Protected video handles are still stripped from the returned
// sections (the editor loads the full curriculum via its own admin endpoint).
const listAllCourses = async () => {
  const courses = await Course.find().sort({ _id: -1 });
  return courses.map(toPublicCourse);
};

// Public read (backward-compatible raw object), with protected video stripped.
const getCourseById = async (id) => {
  assertValidObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw ApiError.notFound('Course not found');
  return toPublicCourse(course);
};

// Admin read: the FULL curriculum, including protected video handles, for the
// course editor. Never exposed on public routes.
const getCurriculum = async (id) => {
  assertValidObjectId(id, 'course id');
  const course = await Course.findById(id).select('title sections');
  if (!course) throw ApiError.notFound('Course not found');
  const obj = course.toObject();
  const sections = Array.isArray(obj.sections) ? [...obj.sections].sort(byOrder) : [];
  sections.forEach((s) => {
    s.lessons = Array.isArray(s.lessons) ? [...s.lessons].sort(byOrder) : [];
  });
  return { _id: obj._id, title: obj.title, sections };
};

// Admin write: bulk-replace the whole curriculum (simplest correct reorder).
const replaceCurriculum = async (id, sections) => {
  assertValidObjectId(id, 'course id');
  const normalized = validateCurriculum(sections);
  const course = await Course.findByIdAndUpdate(
    id,
    { sections: normalized },
    { new: true, runValidators: true }
  ).select('title sections');
  if (!course) throw ApiError.notFound('Course not found');
  return course.toObject();
};

const createCourse = async (payload = {}) => {
  const data = { ...payload };
  if (!data.title || !String(data.title).trim()) {
    throw ApiError.badRequest('title is required');
  }
  validatePrice(data.price);
  validateOriginalPrice(data.originalPrice);

  data.slug = data.slug ? slugify(data.slug) : await generateUniqueSlug(data.title);
  const exists = await Course.findOne({ slug: data.slug });
  if (exists) throw ApiError.conflict('A course with this slug already exists');

  // New courses always start as drafts and are published only via the gated
  // publish endpoint (never directly from client input).
  data.status = 'draft';

  return Course.create(data);
};

// Reasons a course cannot be published (empty ⇒ publishable). Enforces:
// curriculum present, price set, every lesson titled, and no lesson video that
// is still processing / errored / missing its playback id.
const getPublishIssues = (course) => {
  const issues = [];
  const sections = course.sections || [];
  const lessons = sections.flatMap((s) => s.lessons || []);
  if (lessons.length === 0) issues.push('Add at least one lesson before publishing.');
  if (course.price == null) issues.push('Set a course price before publishing.');
  lessons.forEach((l, i) => {
    const label = l.title && String(l.title).trim() ? `"${l.title}"` : `Lesson ${i + 1}`;
    if (!l.title || !String(l.title).trim()) {
      issues.push(`Lesson ${i + 1} is missing a title.`);
    }
    const v = l.video;
    if (isExternalVideo(v)) {
      // External embeddable source — must be an approved provider and verified
      // embeddable with an embed URL (a broken / non-embeddable reference).
      if (!ALLOWED_EXTERNAL_PROVIDERS.includes(v.provider)) {
        issues.push(`${label} uses an unsupported video provider.`);
      }
      if (!v.embeddable) {
        issues.push(`${label} video is not cleared for embedding.`);
      }
      if (!v.embedUrl) {
        issues.push(`${label} external video reference is broken (no embed URL).`);
      }
    } else if (v && (v.assetId || v.uploadId || v.playbackId)) {
      if (v.status && v.status !== 'ready') {
        issues.push(
          v.status === 'errored'
            ? `${label} video is in an error state.`
            : `${label} video is still processing.`
        );
      }
      if (!v.playbackId) {
        issues.push(`${label} video configuration is incomplete (no playback id).`);
      }
    }
  });
  return issues;
};

// Load a course and return its publish issues (used by the publish controller
// before flipping status). Returns { course, issues }.
const evaluatePublish = async (id) => {
  assertValidObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw ApiError.notFound('Course not found');
  return { course, issues: getPublishIssues(course) };
};

// Set a course's publishing status. Publishing is only reached after the caller
// has confirmed there are no publish issues; unpublishing is always allowed.
const setStatus = async (id, status) => {
  assertValidObjectId(id, 'course id');
  if (!['draft', 'published'].includes(status)) {
    throw ApiError.badRequest('status must be draft or published');
  }
  const course = await Course.findById(id);
  if (!course) throw ApiError.notFound('Course not found');
  course.status = status;
  await course.save();
  return toPublicCourse(course);
};

const updateCourse = async (id, payload = {}) => {
  assertValidObjectId(id, 'course id');
  const data = { ...payload };
  // Publishing status is managed only through the gated publish endpoint.
  delete data.status;
  validatePrice(data.price);
  validateOriginalPrice(data.originalPrice);
  if (data.slug) {
    data.slug = slugify(data.slug);
    const clash = await Course.findOne({ slug: data.slug, _id: { $ne: id } });
    if (clash) throw ApiError.conflict('A course with this slug already exists');
  }

  const course = await Course.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
  if (!course) throw ApiError.notFound('Course not found');
  return course;
};

const deleteCourse = async (id) => {
  assertValidObjectId(id, 'course id');
  const course = await Course.findByIdAndDelete(id);
  if (!course) throw ApiError.notFound('Course not found');
  return course;
};

module.exports = {
  listCourses,
  listAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCurriculum,
  replaceCurriculum,
  toPublicCourse,
  validateCurriculum,
  getPublishIssues,
  evaluatePublish,
  setStatus,
  normalizeVideo,
  hasValidVideo,
  isExternalVideo,
  ALLOWED_EXTERNAL_PROVIDERS,
};
