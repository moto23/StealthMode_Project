/**
 * Phase 1 integration test (dev-only, not used in production).
 * Runs the real Express app against an in-memory MongoDB and stubs the
 * Resend email sender so the OTP flow can be exercised end-to-end.
 *
 * Run:  node scripts/phase1_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';
process.env.FRONTEND_URL = 'https://stealthmode-frontend.vercel.app';

const assert = require('assert');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) {
    pass += 1;
    console.log('  PASS -', name);
  } else {
    fail += 1;
    console.log('  FAIL -', name);
  }
};

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  // Stub the email service BEFORE the app/controller require it, so the
  // destructured references inside the controller pick up the mocks.
  const email = require('../services/emailService');
  const captured = { otp: {}, reset: {} };
  email.sendOtpEmail = async (to, name, otp) => {
    captured.otp[to] = otp;
  };
  email.sendPasswordResetEmail = async (to, url) => {
    captured.reset[to] = url;
  };

  const request = require('supertest');
  const app = require('../server');
  const User = require('../models/User');
  const { requireRole } = require('../middleware/auth');

  const EMAIL = 'student@example.com';
  const PASS = 'secret123';

  console.log('\n[1] Register -> issues OTP');
  let r = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Test Student', email: EMAIL, password: PASS });
  check('register returns 201', r.status === 201);
  check('OTP was generated & emailed (captured)', !!captured.otp[EMAIL]);
  check('OTP is 6 digits', /^\d{6}$/.test(captured.otp[EMAIL] || ''));

  console.log('\n[2] Login before verification is blocked');
  r = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASS });
  check('login blocked with 403', r.status === 403);
  check('needsVerification flag returned', r.body.needsVerification === true);

  console.log('\n[3] Verify OTP -> returns JWT + student role');
  r = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email: EMAIL, otp: captured.otp[EMAIL] });
  check('verify returns 200', r.status === 200);
  check('JWT token returned', typeof r.body.token === 'string' && r.body.token.length > 20);
  check('role defaults to student', r.body.data.role === 'student');
  const studentToken = r.body.token;

  console.log('\n[4] Wrong OTP rejected');
  // Re-register an unverified user to get a fresh OTP to tamper with.
  const EMAIL2 = 'pending@example.com';
  await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Pending', email: EMAIL2, password: PASS });
  r = await request(app).post('/api/auth/verify-otp').send({ email: EMAIL2, otp: '000000' });
  check('invalid OTP returns 400', r.status === 400);

  console.log('\n[5] OTP expiry enforced');
  await User.updateOne({ email: EMAIL2 }, { otpExpires: new Date(Date.now() - 1000) });
  r = await request(app)
    .post('/api/auth/verify-otp')
    .send({ email: EMAIL2, otp: captured.otp[EMAIL2] });
  check('expired OTP returns 400', r.status === 400);
  check('expiry message present', /expired/i.test(r.body.error || ''));

  console.log('\n[6] GET /api/auth/me');
  r = await request(app).get('/api/auth/me');
  check('no token -> 401', r.status === 401);
  r = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt');
  check('bad token -> 401', r.status === 401);
  r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${studentToken}`);
  check('valid token -> 200', r.status === 200);
  check('me returns correct email', r.body.data.email === EMAIL);

  console.log('\n[7] Login after verification');
  r = await request(app).post('/api/auth/login').send({ email: EMAIL, password: PASS });
  check('login returns 200 + token', r.status === 200 && !!r.body.token);
  r = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'wrongpass' });
  check('wrong password -> 400', r.status === 400);

  console.log('\n[8] Duplicate registration blocked');
  r = await request(app)
    .post('/api/auth/register')
    .send({ fullName: 'Dup', email: EMAIL, password: PASS });
  check('verified duplicate -> 400 User already exists', r.status === 400 && /already exists/i.test(r.body.error));

  console.log('\n[9] RBAC middleware (requireRole)');
  const run = (role) =>
    new Promise((resolve) => {
      const req = { user: { role } };
      const res = { status: (c) => ({ json: () => resolve(c) }) };
      requireRole('admin')(req, res, () => resolve(200));
    });
  check('student blocked by requireRole(admin) -> 403', (await run('student')) === 403);
  check('admin passes requireRole(admin) -> next()', (await run('admin')) === 200);
  check('unauthenticated blocked -> 401', (await new Promise((resolve) => {
    const res = { status: (c) => ({ json: () => resolve(c) }) };
    requireRole('admin')({}, res, () => resolve(200));
  })) === 401);

  console.log('\n[10] Password reset via Resend flow');
  r = await request(app).post('/api/auth/forgot-password').send({ email: EMAIL });
  check('forgot-password -> 200', r.status === 200);
  check('reset link captured & uses correct frontend URL', /^https:\/\/stealthmode-frontend\.vercel\.app\/reset-password\//.test(captured.reset[EMAIL] || ''));
  const token = (captured.reset[EMAIL] || '').split('/reset-password/')[1];
  r = await request(app).post(`/api/auth/reset-password/${token}`).send({ password: 'newpass123' });
  check('reset-password -> 200', r.status === 200);
  r = await request(app).post('/api/auth/login').send({ email: EMAIL, password: 'newpass123' });
  check('login with new password -> 200', r.status === 200);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);

  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
