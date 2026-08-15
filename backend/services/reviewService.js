const Review = require('../models/Review');
const Course = require('../models/Course');
const Enrolled = require('../models/Enrolled');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');

const assertCourseExists = async (courseId) => {
  assertValidObjectId(courseId, 'course id');
  const exists = await Course.exists({ _id: courseId });
  if (!exists) throw ApiError.notFound('Course not found');
};

const shape = (r) => ({
  _id: r._id,
  userId: String(r.userId),
  userFullName: r.userFullName || 'Student',
  rating: r.rating,
  comment: r.comment || '',
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// Public: all reviews for a course + average/count computed from REAL reviews.
const listReviews = async (courseId) => {
  await assertCourseExists(courseId);
  const reviews = await Review.find({ courseId }).sort({ updatedAt: -1 }).lean();
  const count = reviews.length;
  const average = count
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
    : 0;
  return { reviews: reviews.map(shape), average, count };
};

// The authenticated caller's own review (or null).
const getMyReview = async (userId, courseId) => {
  await assertCourseExists(courseId);
  const mine = await Review.findOne({ userId, courseId }).lean();
  return { review: mine ? shape(mine) : null };
};

const validateRating = (rating) => {
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw ApiError.badRequest('rating must be an integer from 1 to 5');
  }
  return n;
};

// Create or edit the caller's single review. Enrolled users only (403 otherwise).
const upsertReview = async (userId, courseId, { rating, comment }) => {
  await assertCourseExists(courseId);

  const enrolled = await Enrolled.exists({ userId, courseId });
  if (!enrolled) {
    throw ApiError.forbidden('Only enrolled users can review this course');
  }

  const safeRating = validateRating(rating);
  const safeComment = comment != null ? String(comment).trim() : '';

  const user = await User.findById(userId).select('fullName').lean();

  // Upsert keeps exactly one review per (userId, courseId) — the unique index
  // is the backstop; this both creates and edits the caller's own review.
  const review = await Review.findOneAndUpdate(
    { userId, courseId },
    { $set: { rating: safeRating, comment: safeComment, userFullName: user ? user.fullName : 'Student' } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  return { review: shape(review) };
};

// Delete ONLY the caller's own review (scoped by userId).
const deleteReview = async (userId, courseId) => {
  await assertCourseExists(courseId);
  const deleted = await Review.findOneAndDelete({ userId, courseId });
  if (!deleted) throw ApiError.notFound('You have not reviewed this course');
  return { deleted: true };
};

module.exports = { listReviews, getMyReview, upsertReview, deleteReview };
