const express = require('express');
const router = express.Router();

const {
  getCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getCurriculum,
  updateCurriculum,
  getManagedCourses,
  createVideoUpload,
  getVideoUploadStatus,
  requestVideoCaptions,
  publishCourse,
  unpublishCourse,
} = require('../controllers/courseController');
const { enroll, getUserEnrollments } = require('../controllers/enrollmentController');
const reviewController = require('../controllers/reviewController');
const { protect, requireRole } = require('../middleware/auth');

// ---- Public reads (backward compatible with existing frontend) ----
router.get('/', getCourses);

// ---- Enrollment (protected) ----
// Declared before '/:id' so these specific paths are matched first.
router.post('/enroll', protect, enroll);
router.get('/enrolled/:userId', protect, getUserEnrollments);

// ---- Admin course management list (Phase 8) ----
// Distinct literal path (two segments) — declared before the generic '/:id'.
router.get('/manage', protect, requireRole('admin'), getManagedCourses);

// ---- Admin curriculum management (Phase 7, Slice 1) ----
// Full curriculum read (incl. protected video handles) + bulk replace.
router.get('/:id/curriculum', protect, requireRole('admin'), getCurriculum);
router.put('/:id/curriculum', protect, requireRole('admin'), updateCurriculum);

// ---- Admin video (Mux Direct Uploads) + publishing (Phase 8) ----
router.post('/:id/video/uploads', protect, requireRole('admin'), createVideoUpload);
router.get('/:id/video/uploads/:uploadId', protect, requireRole('admin'), getVideoUploadStatus);
router.post('/:id/video/assets/:assetId/captions', protect, requireRole('admin'), requestVideoCaptions);
router.post('/:id/publish', protect, requireRole('admin'), publishCourse);
router.post('/:id/unpublish', protect, requireRole('admin'), unpublishCourse);

// ---- Reviews & ratings (Phase 7, Slice 3) ----
// Declared before the generic '/:id' read. '/reviews/me' is more specific than
// '/reviews' but both are distinct paths, so ordering here is safe.
router.get('/:id/reviews', reviewController.list);                       // public
router.get('/:id/reviews/me', protect, reviewController.mine);           // own review
router.post('/:id/reviews', protect, reviewController.upsert);           // enrolled only
router.delete('/:id/reviews/me', protect, reviewController.remove);      // own review

// ---- Admin course management ----
router.post('/', protect, requireRole('admin'), createCourse);
router.put('/:id', protect, requireRole('admin'), updateCourse);
router.delete('/:id', protect, requireRole('admin'), deleteCourse);

// ---- Public single course (generic, declared last) ----
router.get('/:id', getCourseById);

module.exports = router;
