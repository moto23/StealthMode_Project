/**
 * Phase 7 — Slice 3 (Reviews & Ratings) integration test (dev-only).
 * Covers: enrolled-only creation (401/403), 1–5 validation, one-review-per-user
 * (edit not duplicate), public list with server-computed average/count, own
 * review read, delete-own-only, and empty state. No fabricated ratings.
 *
 * Run:  node scripts/phase7_slice3_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS -', name); }
  else { fail += 1; console.log('  FAIL -', name); }
};

(async () => {
  const mem = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mem.getUri();

  const email = require('../services/emailService');
  const otpBox = {};
  email.sendOtpEmail = async (to, name, otp) => { otpBox[to] = otp; };
  email.sendPasswordResetEmail = async () => {};

  const request = require('supertest');
  const app = require('../server');
  const connectDB = require('../config/db');
  const User = require('../models/User');
  const Enrolled = require('../models/Enrolled');
  const Review = require('../models/Review');

  await connectDB();
  await Enrolled.syncIndexes();
  await Review.syncIndexes();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const alice = await makeUser('Alice A', 'alice@example.com');
  const bob = await makeUser('Bob B', 'bob@example.com');
  const outsider = await makeUser('Outsider O', 'outsider@example.com');
  const admin = await makeUser('Admin User', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  const c = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Review Course', price: 0 });
  const courseId = c.body.data._id;
  const emptyC = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'No Reviews', price: 0 });

  // Alice + Bob enroll (creates Enrolled records); outsider does not.
  await request(app).post('/api/courses/enroll').set(auth(alice.token)).send({ courseId });
  await request(app).post('/api/courses/enroll').set(auth(bob.token)).send({ courseId });

  console.log('\n[1] Creation gate + validation');
  let r = await request(app).post(`/api/courses/${courseId}/reviews`).send({ rating: 5 });
  check('review without token -> 401', r.status === 401);
  r = await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(outsider.token)).send({ rating: 5 });
  check('non-enrolled review -> 403', r.status === 403);
  r = await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(alice.token)).send({ rating: 0 });
  check('rating 0 -> 400', r.status === 400);
  r = await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(alice.token)).send({ rating: 6 });
  check('rating 6 -> 400', r.status === 400);

  console.log('\n[2] Create + public average/count');
  r = await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(alice.token)).send({ rating: 4, comment: 'Solid' });
  check('enrolled create -> 201', r.status === 201 && r.body.review.rating === 4);
  r = await request(app).get(`/api/courses/${courseId}/reviews`);
  check('public list -> count 1, average 4', r.status === 200 && r.body.count === 1 && r.body.average === 4);

  console.log('\n[3] One review per user (edit, not duplicate)');
  r = await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(alice.token)).send({ rating: 2, comment: 'Changed my mind' });
  check('re-submit edits existing review -> 201', r.status === 201 && r.body.review.rating === 2);
  r = await request(app).get(`/api/courses/${courseId}/reviews`);
  check('still only 1 review after edit', r.body.count === 1 && r.body.average === 2);
  r = await request(app).get(`/api/courses/${courseId}/reviews/me`).set(auth(alice.token));
  check('GET own review reflects the edit', r.body.review && r.body.review.rating === 2);

  console.log('\n[4] Second reviewer + average from real reviews');
  await request(app).post(`/api/courses/${courseId}/reviews`).set(auth(bob.token)).send({ rating: 5 });
  r = await request(app).get(`/api/courses/${courseId}/reviews`);
  check('two reviews -> count 2, average 3.5', r.body.count === 2 && r.body.average === 3.5);

  console.log('\n[5] Delete own only');
  r = await request(app).delete(`/api/courses/${courseId}/reviews/me`).set(auth(alice.token));
  check('delete own review -> 200', r.status === 200);
  r = await request(app).get(`/api/courses/${courseId}/reviews`);
  check('after delete -> count 1, average 5 (Bob remains)', r.body.count === 1 && r.body.average === 5);
  r = await request(app).delete(`/api/courses/${courseId}/reviews/me`).set(auth(alice.token));
  check('deleting when none exists -> 404', r.status === 404);
  r = await request(app).get(`/api/courses/${courseId}/reviews/me`).set(auth(bob.token));
  check("Bob's review still intact (delete was scoped to caller)", r.body.review && r.body.review.rating === 5);

  console.log('\n[6] Empty state (no fabricated ratings)');
  r = await request(app).get(`/api/courses/${emptyC.body.data._id}/reviews`);
  check('course with no reviews -> count 0, average 0', r.status === 200 && r.body.count === 0 && r.body.average === 0);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
