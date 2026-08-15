const learnService = require('../services/learnService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// GET /api/learn/progress/summary  (protected) — { progress: { courseId: percent } }
exports.summary = asyncHandler(async (req, res) => {
  const data = await learnService.getProgressSummary(req.user.id);
  res.json({ success: true, ...data });
});

// GET /api/learn/:courseId  (protected; 403 if not enrolled)
exports.getLearn = asyncHandler(async (req, res) => {
  const data = await learnService.getLearnData(req.user.id, req.params.courseId);
  res.json({ success: true, data });
});

// POST /api/learn/:courseId/progress/complete  (protected; enrolled)
// Body: { lessonId, completed? } — percentage is computed server-side.
exports.complete = asyncHandler(async (req, res) => {
  const { lessonId, completed } = req.body;
  if (!lessonId) throw ApiError.badRequest('lessonId is required');
  const data = await learnService.setLessonComplete(
    req.user.id,
    req.params.courseId,
    lessonId,
    completed === undefined ? true : Boolean(completed)
  );
  res.json({ success: true, data });
});

// POST /api/learn/:courseId/progress/current  (protected; enrolled)
// Body: { lessonId } — persists the resume point.
exports.setCurrent = asyncHandler(async (req, res) => {
  const { lessonId } = req.body;
  if (!lessonId) throw ApiError.badRequest('lessonId is required');
  const data = await learnService.setCurrentLesson(req.user.id, req.params.courseId, lessonId);
  res.json({ success: true, data });
});
