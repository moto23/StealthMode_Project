const express = require('express');
const {
  registerUser,
  verifyOtp,
  resendOtp,
  loginUser,
  getMe,
  requestPasswordReset,
  resetPassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public
router.post('/register', registerUser);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', loginUser);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password/:token', resetPassword);

// Protected
router.get('/me', protect, getMe);

module.exports = router;
