// backend/services/emailService.js
const { Resend } = require('resend');

const getClient = () => {
  if (!process.env.RESEND_API_KEY) {
    // Surfaced to the caller so the API can return a clear, actionable error.
    throw new Error('EMAIL_NOT_CONFIGURED');
  }
  return new Resend(process.env.RESEND_API_KEY);
};

const fromAddress = () =>
  process.env.RESEND_FROM_EMAIL || 'StealthMode <onboarding@resend.dev>';

const brandStyle =
  'font-family: Arial, Helvetica, sans-serif; color: #3a2a20; line-height: 1.6;';

// Send the email-verification OTP. The OTP is never logged.
const sendOtpEmail = async (to, fullName, otp) => {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: 'Your StealthMode verification code',
    html: `
      <div style="${brandStyle}">
        <h2 style="color:#5a3d2c;">Verify your email</h2>
        <p>Hi ${fullName || 'there'},</p>
        <p>Use the following one-time code to verify your StealthMode account:</p>
        <p style="font-size:28px; font-weight:bold; letter-spacing:6px; color:#4a3220;">${otp}</p>
        <p>This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
        <p>If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send verification email');
  }
  return data;
};

// Send the password-reset link.
const sendPasswordResetEmail = async (to, resetUrl) => {
  const resend = getClient();
  const { data, error } = await resend.emails.send({
    from: fromAddress(),
    to,
    subject: 'Reset your StealthMode password',
    html: `
      <div style="${brandStyle}">
        <h2 style="color:#5a3d2c;">Password reset</h2>
        <p>You requested to reset your password. Click the link below to continue:</p>
        <p><a href="${resetUrl}" style="color:#7a5230; font-weight:bold;">Reset my password</a></p>
        <p>This link expires in 1 hour. If you did not request this, ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(error.message || 'Failed to send password reset email');
  }
  return data;
};

module.exports = { sendOtpEmail, sendPasswordResetEmail };
