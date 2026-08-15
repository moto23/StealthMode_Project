const courseService = require('../services/courseService');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/courses  (public) — backward-compatible raw array
exports.getCourses = asyncHandler(async (req, res) => {
  const courses = await courseService.listCourses();
  res.json(courses);
});

// GET /api/courses/:id  (public) — backward-compatible raw object
exports.getCourseById = asyncHandler(async (req, res) => {
  const course = await courseService.getCourseById(req.params.id);
  res.json(course);
});

// POST /api/courses  (admin)
exports.createCourse = asyncHandler(async (req, res) => {
  const course = await courseService.createCourse(req.body);
  res.status(201).json({ success: true, data: course });
});

// PUT /api/courses/:id  (admin)
exports.updateCourse = asyncHandler(async (req, res) => {
  const course = await courseService.updateCourse(req.params.id, req.body);
  res.json({ success: true, data: course });
});

// DELETE /api/courses/:id  (admin)
exports.deleteCourse = asyncHandler(async (req, res) => {
  await courseService.deleteCourse(req.params.id);
  res.json({ success: true, message: 'Course deleted' });
});

// GET /api/courses/:id/curriculum  (admin) — FULL curriculum for the editor,
// including protected video handles (never exposed on public routes).
exports.getCurriculum = asyncHandler(async (req, res) => {
  const data = await courseService.getCurriculum(req.params.id);
  res.json({ success: true, data });
});

// PUT /api/courses/:id/curriculum  (admin) — bulk-replace sections[]/lessons[].
exports.updateCurriculum = asyncHandler(async (req, res) => {
  const data = await courseService.replaceCurriculum(req.params.id, req.body.sections);
  res.json({ success: true, data });
});
