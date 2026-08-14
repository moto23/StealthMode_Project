const express = require('express');
const router = express.Router();

const {
  createOrder,
  verify,
  status,
  cartCreateOrder,
  cartVerify,
  owned,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

// All payment routes require an authenticated user (userId comes from the JWT).

// ---- Single-course flow (Phase 3, unchanged) ----
router.post('/create-order', protect, createOrder);
router.post('/verify', protect, verify);
router.get('/status/:courseId', protect, status);

// ---- Multi-course cart flow (Phase 4) ----
router.post('/cart/create-order', protect, cartCreateOrder);
router.post('/cart/verify', protect, cartVerify);
router.get('/owned', protect, owned);

module.exports = router;
