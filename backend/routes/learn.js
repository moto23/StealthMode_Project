const express = require('express');
const router = express.Router();

const { summary, getLearn, complete, setCurrent, playback } = require('../controllers/learnController');
const { protect } = require('../middleware/auth');

// All learn routes require an authenticated user; the service additionally
// enforces course enrollment (403 for non-enrolled users). Preview lessons are
// the only exception — playable by any logged-in user (see learnService).

// Declared before '/:courseId' so this specific path is matched first.
router.get('/progress/summary', protect, summary);

// Signed video playback token (Slice 4). Distinct multi-segment path, so it
// never collides with the single-segment '/:courseId' read.
router.get('/:courseId/lessons/:lessonId/playback', protect, playback);

router.get('/:courseId', protect, getLearn);
router.post('/:courseId/progress/complete', protect, complete);
router.post('/:courseId/progress/current', protect, setCurrent);

module.exports = router;
