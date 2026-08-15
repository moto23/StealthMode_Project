const express = require('express');
const router = express.Router();

const { summary, getLearn, complete, setCurrent } = require('../controllers/learnController');
const { protect } = require('../middleware/auth');

// All learn routes require an authenticated user; the service additionally
// enforces course enrollment (403 for non-enrolled users).

// Declared before '/:courseId' so this specific path is matched first.
router.get('/progress/summary', protect, summary);

router.get('/:courseId', protect, getLearn);
router.post('/:courseId/progress/complete', protect, complete);
router.post('/:courseId/progress/current', protect, setCurrent);

module.exports = router;
