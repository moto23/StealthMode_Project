const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { sendOtpEmail, sendPasswordResetEmail } = require('../services/emailService');
const { generateOtp, hashOtp, compareOtp, otpExpiryDate } = require('../utils/otp');

// ---- helpers ----
const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

const sanitize = (user) => ({
  _id: user._id,
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  isVerified: user.isVerified,
  enrolledCourses: user.enrolledCourses,
});

// Issue a fresh OTP on the user document and email it.
const issueOtp = async (user) => {
  const otp = generateOtp();
  user.otpHash = await hashOtp(otp);
  user.otpExpires = otpExpiryDate();
  await user.save();
  await sendOtpEmail(user.email, user.fullName, otp); // otp is never logged
};

const handleEmailError = (res, err) => {
  if (err.message === 'EMAIL_NOT_CONFIGURED') {
    return res.status(503).json({
      success: false,
      error: 'Email service is not configured. Set RESEND_API_KEY on the server.',
    });
  }
  return res.status(502).json({ success: false, error: 'Failed to send email' });
};

// ---- REGISTER: create pending (unverified) user + send OTP ----
const registerUser = async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    return res
      .status(400)
      .json({ success: false, error: 'fullName, email and password are required' });
  }
  if (password.length < 6) {
    return res
      .status(400)
      .json({ success: false, error: 'Password must be at least 6 characters' });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    if (user && user.isVerified) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (user && !user.isVerified) {
      // Re-registration of an unverified account: refresh details + OTP.
      user.fullName = fullName;
      user.password = hashedPassword;
    } else {
      user = new User({
        fullName,
        email: normalizedEmail,
        password: hashedPassword,
        role: 'student',
        isVerified: false,
      });
    }

    try {
      await issueOtp(user);
    } catch (err) {
      return handleEmailError(res, err);
    }

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Check your email for the verification code.',
      email: user.email,
    });
  } catch (error) {
    console.error('Error during registration:', error.message);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
};

// ---- VERIFY OTP: confirm email, then issue JWT ----
const verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, error: 'Email and OTP are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid request' });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, error: 'Email already verified. Please log in.' });
    }
    if (!user.otpHash || !user.otpExpires || user.otpExpires < new Date()) {
      return res
        .status(400)
        .json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }

    const match = await compareOtp(otp, user.otpHash);
    if (!match) {
      return res.status(400).json({ success: false, error: 'Invalid OTP' });
    }

    user.isVerified = true;
    user.otpHash = null;
    user.otpExpires = null;
    await user.save();

    const token = signToken(user);
    return res.json({ success: true, token, data: sanitize(user) });
  } catch (error) {
    console.error('Error during OTP verification:', error.message);
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
};

// ---- RESEND OTP ----
const resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.isVerified) {
      // Do not reveal account state.
      return res.json({ success: true, message: 'If the account exists, a new code was sent.' });
    }

    try {
      await issueOtp(user);
    } catch (err) {
      return handleEmailError(res, err);
    }

    return res.json({ success: true, message: 'A new verification code has been sent.' });
  } catch (error) {
    console.error('Error resending OTP:', error.message);
    return res.status(500).json({ success: false, error: 'Could not resend code' });
  }
};

// ---- LOGIN ----
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Please verify your email before logging in.',
        needsVerification: true,
        email: user.email,
      });
    }

    const token = signToken(user);
    return res.json({ success: true, token, data: sanitize(user) });
  } catch (error) {
    console.error('Error during login:', error.message);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
};

// ---- GET CURRENT USER ---- (protected)
const getMe = async (req, res) => {
  // req.user is attached by the `protect` middleware.
  return res.json({ success: true, data: sanitize(req.user) });
};

// ---- PASSWORD RESET REQUEST ----
const requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always respond success to avoid account enumeration.
    if (!user) {
      return res.json({ success: true, message: 'If the account exists, a reset link was sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    const frontendUrl = process.env.FRONTEND_URL || 'https://stealthmode-frontend.vercel.app';
    const resetUrl = `${frontendUrl}/reset-password/${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      return handleEmailError(res, err);
    }

    return res.json({ success: true, message: 'If the account exists, a reset link was sent.' });
  } catch (error) {
    console.error('Error requesting password reset:', error.message);
    return res.status(500).json({ success: false, error: 'Could not process request' });
  }
};

// ---- PASSWORD RESET ----
const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res
      .status(400)
      .json({ success: false, error: 'Password must be at least 6 characters' });
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, error: 'Password reset token is invalid or has expired' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ success: true, message: 'Password has been reset' });
  } catch (error) {
    console.error('Error resetting password:', error.message);
    return res.status(500).json({ success: false, error: 'Could not reset password' });
  }
};

module.exports = {
  registerUser,
  verifyOtp,
  resendOtp,
  loginUser,
  getMe,
  requestPasswordReset,
  resetPassword,
};
