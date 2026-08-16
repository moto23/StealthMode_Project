const courseService = require('../services/courseService');
const muxAssetService = require('../services/muxAssetService');
const courseSeedingService = require('../services/courseSeedingService');
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

// ---- Phase 8: admin management, Mux Direct Uploads, publishing ----

// GET /api/courses/manage  (admin) — ALL courses incl. drafts, with status.
exports.getManagedCourses = asyncHandler(async (req, res) => {
  const data = await courseService.listAllCourses();
  res.json({ success: true, data });
});

// POST /api/courses/:id/video/uploads  (admin) — start a Mux Direct Upload.
// Returns { uploadId, url }. The browser PUTs the file straight to `url`;
// binaries never touch our backend. New assets default to SIGNED playback.
exports.createVideoUpload = asyncHandler(async (req, res) => {
  const corsOrigin = req.headers.origin || process.env.FRONTEND_URL || '*';
  const data = await muxAssetService.createDirectUpload({ corsOrigin });
  res.status(201).json({ success: true, data });
});

// GET /api/courses/:id/video/uploads/:uploadId  (admin) — poll upload/asset
// status; once ready returns { status:'ready', assetId, playbackId, captions }.
exports.getVideoUploadStatus = asyncHandler(async (req, res) => {
  const data = await muxAssetService.resolveUpload(req.params.uploadId);
  res.json({ success: true, data });
});

// POST /api/courses/:id/video/assets/:assetId/captions  (admin) — ask Mux to
// auto-generate subtitles/captions for a ready asset.
exports.requestVideoCaptions = asyncHandler(async (req, res) => {
  const { languageCode, name } = req.body || {};
  const data = await muxAssetService.requestGeneratedCaptions(req.params.assetId, { languageCode, name });
  res.status(201).json({ success: true, data });
});

// POST /api/courses/:id/publish  (admin) — validate then publish. Returns the
// blocking issues (400) when the course is not ready.
exports.publishCourse = asyncHandler(async (req, res) => {
  const { issues } = await courseService.evaluatePublish(req.params.id);
  if (issues.length) {
    return res.status(400).json({ success: false, error: 'Course is not ready to publish', issues });
  }
  const data = await courseService.setStatus(req.params.id, 'published');
  return res.json({ success: true, data });
});

// POST /api/courses/:id/unpublish  (admin) — return a course to draft.
exports.unpublishCourse = asyncHandler(async (req, res) => {
  const data = await courseService.setStatus(req.params.id, 'draft');
  res.json({ success: true, data });
});

// POST /api/courses/:id/auto-generate  (admin) — Phase 8.5: generate a
// curriculum from the course's real metadata and attach LEGALLY EMBEDDABLE
// videos. Body { mode: 'fill' | 'replace' } (default 'fill', idempotent).
// Returns { report, curriculum }.
exports.autoGenerateCourse = asyncHandler(async (req, res) => {
  const mode = req.body && req.body.mode === 'replace' ? 'replace' : 'fill';
  const data = await courseSeedingService.autoGenerate(req.params.id, { mode });
  res.json({ success: true, data });
});
