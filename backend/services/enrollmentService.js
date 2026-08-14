const Enrolled = require('../models/Enrolled');
const Course = require('../models/Course');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');

// Create the enrollment record (idempotent at the DB level via the unique index).
const createEnrollment = async (user, course) => {
  try {
    return await Enrolled.create({
      userId: user._id,
      courseId: course._id,
      userFullName: user.fullName,
      courseTitle: course.title,
    });
  } catch (err) {
    if (err && err.code === 11000) {
      throw ApiError.conflict('Already enrolled in this course');
    }
    throw err;
  }
};

// FREE enrollment path (public). userId always comes from the verified JWT.
// Paid courses (price > 0) MUST go through payment — this path rejects them so
// payment cannot be bypassed.
const enroll = async (userId, courseId) => {
  assertValidObjectId(courseId, 'course id');

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  if (Number(course.price) > 0) {
    throw ApiError.forbidden('This is a paid course. Please complete payment to enroll.');
  }

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  return createEnrollment(user, course);
};

// Grant access after a VERIFIED payment. No price gate here (payment already
// confirmed). Idempotent: returns the existing enrollment if one exists.
const grantAccess = async (userId, courseId) => {
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  const existing = await Enrolled.findOne({ userId, courseId });
  if (existing) return existing;

  try {
    return await createEnrollment(user, course);
  } catch (err) {
    // Race: another request created it first — treat as success.
    if (err && (err.code === 11000 || err.statusCode === 409)) {
      return Enrolled.findOne({ userId, courseId });
    }
    throw err;
  }
};

// List a user's enrollments (populated), backward-compatible raw array.
const listForUser = async (userId) => {
  assertValidObjectId(userId, 'user id');
  return Enrolled.find({ userId }).populate('courseId');
};

// Authoritative ownership: the set of courseIds the user has access to (free
// enrollment OR a verified paid purchase both create an Enrolled record).
const listOwnedCourseIds = async (userId) => {
  const rows = await Enrolled.find({ userId }).select('courseId').lean();
  return rows.map((r) => String(r.courseId));
};

module.exports = { enroll, grantAccess, listForUser, listOwnedCourseIds };
