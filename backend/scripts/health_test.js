/**
 * Startup-hardening test (dev-only). Verifies the serverless app does NOT
 * crash at import or on /api/health when required env vars are absent.
 *
 * Run from a directory WITHOUT a .env file so dotenv loads nothing, e.g.:
 *   cd <somewhere-without-.env> && node <abs>/backend/scripts/health_test.js
 */

// Belt-and-suspenders: ensure the required vars are absent for this process.
[
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'FRONTEND_URL',
  'OTP_EXPIRY_MINUTES',
].forEach((k) => delete process.env[k]);

const request = require('supertest');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS -', name); }
  else { fail += 1; console.log('  FAIL -', name); }
};

(async () => {
  console.log('\n[A] Import server with all env vars ABSENT');
  let app;
  try {
    app = require('../server'); // triggers dotenv.config() -> no .env here
    check('server.js imports without throwing', true);
  } catch (e) {
    check('server.js imports without throwing', false);
    console.error('  import error:', e.message);
    process.exit(1);
  }

  console.log('\n[B] /api/health with no DB / no Resend');
  let r = await request(app).get('/api/health');
  check('GET /api/health -> 200', r.status === 200);
  check('health reports mongoConfigured=false', r.body.config.mongoConfigured === false);
  check('health reports resendConfigured=false', r.body.config.resendConfigured === false);

  r = await request(app).get('/');
  check('GET / -> 200 (also health)', r.status === 200);

  console.log('\n[C] DB-dependent routes fail in a CONTROLLED way (no crash)');
  r = await request(app).get('/api/courses');
  check('GET /api/courses -> 503 (not a crash)', r.status === 503);

  r = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'A', email: 'a@b.com', password: 'secret1' });
  check('POST /api/auth/register -> 503 via DB gate (not a crash)', r.status === 503);

  console.log('\n[D] Email service errors only when actually used, and is controlled');
  const email = require('../services/emailService');
  let emailErr = null;
  try {
    await email.sendOtpEmail('a@b.com', 'A', '123456');
  } catch (e) {
    emailErr = e.message;
  }
  check('sendOtpEmail throws EMAIL_NOT_CONFIGURED when key absent', emailErr === 'EMAIL_NOT_CONFIGURED');

  console.log('\n[E] Health still 200 once (placeholder) config is present');
  process.env.MONGODB_URI = 'mongodb://placeholder:27017/db';
  process.env.JWT_SECRET = 'placeholder';
  process.env.RESEND_API_KEY = 'placeholder';
  process.env.RESEND_FROM_EMAIL = 'StealthMode <onboarding@resend.dev>';
  process.env.FRONTEND_URL = 'https://stealthmode-frontend.vercel.app';
  r = await request(app).get('/api/health');
  check('GET /api/health -> 200 with placeholders', r.status === 200);
  check('config booleans flip to true', r.body.config.mongoConfigured === true && r.body.config.resendConfigured === true);
  check('frontendUrl reflected (non-secret)', r.body.config.frontendUrl === 'https://stealthmode-frontend.vercel.app');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
