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
} = require('../controllers/courseController');
const { enroll, getUserEnrollments } = require('../controllers/enrollmentController');
const { protect, requireRole } = require('../middleware/auth');

// ---- Public reads (backward compatible with existing frontend) ----
router.get('/', getCourses);

// ---- Enrollment (protected) ----
// Declared before '/:id' so these specific paths are matched first.
router.post('/enroll', protect, enroll);
router.get('/enrolled/:userId', protect, getUserEnrollments);

// ---- Admin curriculum management (Phase 7, Slice 1) ----
// Full curriculum read (incl. protected video handles) + bulk replace.
router.get('/:id/curriculum', protect, requireRole('admin'), getCurriculum);
router.put('/:id/curriculum', protect, requireRole('admin'), updateCurriculum);

// ---- Admin course management ----
router.post('/', protect, requireRole('admin'), createCourse);
router.put('/:id', protect, requireRole('admin'), updateCourse);
router.delete('/:id', protect, requireRole('admin'), deleteCourse);

// ---- Public single course (generic, declared last) ----
router.get('/:id', getCourseById);

module.exports = router;
