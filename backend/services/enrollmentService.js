const Enrolled = require('../models/Enrolled');
const Course = require('../models/Course');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');

// Enroll a specific (already authenticated) user in a course.
// userId always comes from the verified JWT, never from the request body.
const enroll = async (userId, courseId) => {
  assertValidObjectId(courseId, 'course id');

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');

  try {
    return await Enrolled.create({
      userId,
      courseId,
      userFullName: user.fullName,
      courseTitle: course.title,
    });
  } catch (err) {
    // Duplicate key from the (userId, courseId) unique index.
    if (err && err.code === 11000) {
      throw ApiError.conflict('Already enrolled in this course');
    }
    throw err;
  }
};

// List a user's enrollments (populated), backward-compatible raw array.
const listForUser = async (userId) => {
  assertValidObjectId(userId, 'user id');
  return Enrolled.find({ userId }).populate('courseId');
};

module.exports = { enroll, listForUser };
