const express = require('express');
const router = express.Router();

const { createOrder, verify, status } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// All payment routes require an authenticated user (userId comes from the JWT).
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verify);
router.get('/status/:courseId', protect, status);

module.exports = router;
