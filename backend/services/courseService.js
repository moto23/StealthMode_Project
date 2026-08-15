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

// ---- Curriculum helpers (Phase 7, Slice 1) ----

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);

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
        if (!lesson.isPreview) {
          // Remove protected handles; keep title/order/duration/isPreview.
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
      const video = lesson.video && typeof lesson.video === 'object' ? lesson.video : undefined;
      return {
        title: String(lesson.title).trim(),
        order: li,
        duration: lesson.duration != null ? String(lesson.duration) : undefined,
        isPreview: Boolean(lesson.isPreview),
        video: video
          ? {
              provider: video.provider != null ? String(video.provider) : undefined,
              assetId: video.assetId != null ? String(video.assetId) : undefined,
              playbackId: video.playbackId != null ? String(video.playbackId) : undefined,
            }
          : undefined,
      };
    });
    return { title: String(section.title).trim(), order: si, lessons };
  });
};

// Public read (backward-compatible raw array), with protected video stripped.
const listCourses = async () => {
  const courses = await Course.find();
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

  return Course.create(data);
};

const updateCourse = async (id, payload = {}) => {
  assertValidObjectId(id, 'course id');
  const data = { ...payload };
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
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCurriculum,
  replaceCurriculum,
  toPublicCourse,
  validateCurriculum,
};
