/**
 * Phase 2 integration test (dev-only). Runs the real Express app against an
 * in-memory MongoDB, stubbing the email sender. Covers MVC/course CRUD, RBAC,
 * protected/auth-derived enrollment, DB-level duplicate prevention, ObjectId
 * validation, and backward-compatible public reads.
 *
 * Run:  node scripts/phase2_test.js
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

  // Establish the connection first (the app connects lazily per-request),
  // then build the (userId, courseId) unique index (autoIndex is off).
  await connectDB();
  await Enrolled.syncIndexes();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };

  const student = await makeUser('Student One', 'student@example.com');
  const other = await makeUser('Student Two', 'other@example.com');
  const admin = await makeUser('Admin User', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  console.log('\n[1] Admin-only course creation (RBAC via protect + requireRole)');
  let r = await request(app).post('/api/courses').send({ title: 'X' });
  check('create without token -> 401', r.status === 401);
  r = await request(app).post('/api/courses').set(auth(student.token)).send({ title: 'Blocked' });
  check('create as student -> 403', r.status === 403);
  r = await request(app).post('/api/courses').set(auth(admin.token)).send({
    title: 'Phase 2 Test Course', description: 'demo', category: 'Web Development',
    level: 'Beginner', duration: '10 hours', instructor: 'Test Instructor', price: 1299,
  });
  check('create as admin -> 201', r.status === 201);
  check('response shape { success, data }', r.body.success === true && !!r.body.data);
  check('slug auto-generated', r.body.data.slug === 'phase-2-test-course');
  const courseId = r.body.data._id;

  console.log('\n[2] Create validation');
  r = await request(app).post('/api/courses').set(auth(admin.token)).send({ description: 'no title' });
  check('missing title -> 400', r.status === 400);
  r = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Bad Price', price: -5 });
  check('negative price -> 400', r.status === 400);
  r = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Phase 2 Test Course' });
  check('duplicate title -> unique slug (-2)', r.body.data && r.body.data.slug === 'phase-2-test-course-2');

  console.log('\n[3] Public reads stay backward compatible (raw array / object)');
  r = await request(app).get('/api/courses');
  check('GET /api/courses -> 200 raw array', r.status === 200 && Array.isArray(r.body));
  r = await request(app).get(`/api/courses/${courseId}`);
  check('GET /api/courses/:id -> 200 raw object (has title, no success wrapper)', r.status === 200 && r.body.title === 'Phase 2 Test Course' && r.body.success === undefined);

  console.log('\n[4] ObjectId validation + not found');
  r = await request(app).get('/api/courses/not-a-valid-id');
  check('invalid ObjectId -> 400', r.status === 400);
  r = await request(app).get('/api/courses/64b64c14b4a1e2a1c8f00000');
  check('valid but missing id -> 404', r.status === 404);

  console.log('\n[5] Admin update / delete RBAC');
  r = await request(app).put(`/api/courses/${courseId}`).set(auth(student.token)).send({ price: 999 });
  check('update as student -> 403', r.status === 403);
  r = await request(app).put(`/api/courses/${courseId}`).set(auth(admin.token)).send({ price: 1499 });
  check('update as admin -> 200', r.status === 200 && r.body.data.price === 1499);

  console.log('\n[6] Protected enrollment; userId derived from JWT (never body)');
  r = await request(app).post('/api/courses/enroll').send({ courseId });
  check('enroll without token -> 401', r.status === 401);
  // Body carries a DIFFERENT userId to prove it is ignored.
  r = await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId, userId: other.id });
  check('enroll as student -> 201', r.status === 201);
  check('enrollment userId comes from JWT, not body', String(r.body.data.userId) === String(student.id));
  r = await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId });
  check('duplicate enroll -> 409 (DB unique index)', r.status === 409);
  r = await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId: 'bad' });
  check('enroll invalid courseId -> 400', r.status === 400);
  r = await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId: '64b64c14b4a1e2a1c8f00000' });
  check('enroll missing course -> 404', r.status === 404);

  console.log('\n[7] Enrollment read: own-data only for students');
  r = await request(app).get(`/api/courses/enrolled/${student.id}`).set(auth(student.token));
  check('student reads OWN enrollments -> 200 raw array', r.status === 200 && Array.isArray(r.body) && r.body.length === 1);
  check('enrolled list is populated (courseId.title present)', r.body[0].courseId && r.body[0].courseId.title === 'Phase 2 Test Course');
  r = await request(app).get(`/api/courses/enrolled/${student.id}`).set(auth(other.token));
  check('student reads ANOTHER user enrollments -> 403', r.status === 403);
  r = await request(app).get(`/api/courses/enrolled/${student.id}`).set(auth(admin.token));
  check('admin reads any enrollments -> 200', r.status === 200);
  r = await request(app).get(`/api/courses/enrolled/${student.id}`);
  check('enrollments without token -> 401', r.status === 401);

  console.log('\n[8] Error responses are consistent { success:false, error }');
  r = await request(app).post('/api/courses').set(auth(student.token)).send({ title: 'x' });
  check('error shape { success:false, error }', r.body.success === false && typeof r.body.error === 'string');

  console.log('\n[9] Admin delete removes the course');
  r = await request(app).delete(`/api/courses/${courseId}`).set(auth(admin.token));
  check('delete as admin -> 200', r.status === 200 && r.body.success === true);
  r = await request(app).get(`/api/courses/${courseId}`);
  check('deleted course -> 404', r.status === 404);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
