const enrollmentService = require('../services/enrollmentService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// POST /api/courses/enroll  (protected)
// userId is taken from the verified JWT (req.user), never the body.
exports.enroll = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) throw ApiError.badRequest('courseId is required');

  const enrollment = await enrollmentService.enroll(req.user.id, courseId);
  res
    .status(201)
    .json({ success: true, message: 'Enrolled successfully', data: enrollment });
});

// GET /api/courses/enrolled/:userId  (protected)
// A student may only read their own enrollments; admins may read anyone's.
exports.getUserEnrollments = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user.role !== 'admin' && req.user.id !== userId) {
    throw ApiError.forbidden('You can only view your own enrollments');
  }

  const enrollments = await enrollmentService.listForUser(userId);
  res.json(enrollments); // backward-compatible raw array
});
