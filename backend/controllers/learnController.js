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

// GET /api/learn/:courseId/lessons/:lessonId/playback  (protected)
// Returns a short-lived Mux signed playback token for the lesson. Enrollment is
// enforced for protected lessons; preview lessons are open to any logged-in
// user. Never returns the Mux asset id or any signing credential.
exports.playback = asyncHandler(async (req, res) => {
  const data = await learnService.getLessonPlayback(
    req.user.id,
    req.params.courseId,
    req.params.lessonId
  );
  res.json({ success: true, data });
});

// GET /api/learn/:courseId/lessons/:lessonId/transcript  (protected)
// Plain-text transcript, returned only when Mux has a ready caption track.
// Same authorization as playback (preview open; protected requires enrollment).
exports.transcript = asyncHandler(async (req, res) => {
  const data = await learnService.getLessonTranscript(
    req.user.id,
    req.params.courseId,
    req.params.lessonId
  );
  res.json({ success: true, data });
});
