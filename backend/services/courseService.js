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

// Public read (backward-compatible raw array).
const listCourses = () => Course.find();

// Public read (backward-compatible raw object).
const getCourseById = async (id) => {
  assertValidObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw ApiError.notFound('Course not found');
  return course;
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
};
