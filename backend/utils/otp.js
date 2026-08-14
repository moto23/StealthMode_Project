// backend/utils/otp.js
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Generate a cryptographically-strong 6-digit numeric OTP.
const generateOtp = () => {
  // 0 - 999999, zero-padded to 6 digits
  const n = crypto.randomInt(0, 1000000);
  return n.toString().padStart(6, '0');
};

const hashOtp = async (otp) => bcrypt.hash(otp, 10);

const compareOtp = async (otp, otpHash) => {
  if (!otpHash) return false;
  return bcrypt.compare(otp, otpHash);
};

const otpExpiryDate = () => {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
  return new Date(Date.now() + minutes * 60 * 1000);
};

module.exports = { generateOtp, hashOtp, compareOtp, otpExpiryDate };
