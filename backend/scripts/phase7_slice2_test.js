/**
 * Phase 7 — Slice 2 (Learn + Progress) integration test (dev-only).
 * Covers: enrollment gate (401/403), curriculum-driven learn payload,
 * server-computed completion percentage (client percentages ignored),
 * (userId,courseId,lessonId) de-dup protection, lesson validation, resume
 * (current lesson), progress summary, and empty-curriculum courses still work.
 *
 * Run:  node scripts/phase7_slice2_test.js
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
  const Progress = require('../models/Progress');

  await connectDB();
  await Enrolled.syncIndexes();
  await Progress.syncIndexes();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const student = await makeUser('Learner One', 'learner@example.com');
  const other = await makeUser('Other User', 'other@example.com');
  const admin = await makeUser('Admin User', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  // FREE course so the student can self-enroll (creates the Enrolled record).
  const c = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Learn Course', price: 0 });
  const courseId = c.body.data._id;

  // Curriculum: 2 sections, 3 lessons total.
  await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({
    sections: [
      { title: 'Intro', lessons: [{ title: 'L1' }, { title: 'L2' }] },
      { title: 'Advanced', lessons: [{ title: 'L3' }] },
    ],
  });
  const cur = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  const lessonIds = cur.body.data.sections.flatMap((s) => s.lessons.map((l) => l._id));
  const [L1, L2, L3] = lessonIds;

  // Student enrolls in the free course.
  await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId });

  console.log('\n[1] Access gate');
  let r = await request(app).get(`/api/learn/${courseId}`);
  check('GET learn without token -> 401', r.status === 401);
  r = await request(app).get(`/api/learn/${courseId}`).set(auth(other.token));
  check('GET learn as non-enrolled user -> 403', r.status === 403);
  r = await request(app).get(`/api/learn/${courseId}`).set(auth(student.token));
  check('GET learn as enrolled -> 200', r.status === 200);
  check('learn payload has 2 sections + 3 lessons', r.body.data.sections.length === 2 && r.body.data.totalLessons === 3);
  check('initial percent is 0', r.body.data.percent === 0);
  check('lessons carry no protected video field', r.body.data.sections[0].lessons[0].video === undefined);

  console.log('\n[2] Server-computed percentage + de-dup');
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: L1, percent: 999 });
  check('mark L1 complete -> 200', r.status === 200);
  check('percent computed server-side = 33 (ignores client percent:999)', r.body.data.percent === 33);
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: L1 });
  check('re-mark L1 does NOT double-count (still 33)', r.body.data.percent === 33 && r.body.data.completedLessonIds.length === 1);
  await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: L2 });
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: L3 });
  check('completing all lessons -> 100', r.body.data.percent === 100);
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: L1, completed: false });
  check('un-marking L1 -> 67', r.body.data.percent === 67);

  console.log('\n[3] Validation');
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({ lessonId: '64b64c14b4a1e2a1c8f00000' });
  check('lesson not in course -> 400', r.status === 400);
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(student.token)).send({});
  check('missing lessonId -> 400', r.status === 400);
  r = await request(app).post(`/api/learn/${courseId}/progress/complete`).set(auth(other.token)).send({ lessonId: L1 });
  check('non-enrolled cannot write progress -> 403', r.status === 403);

  console.log('\n[4] Resume (current lesson) persistence');
  r = await request(app).post(`/api/learn/${courseId}/progress/current`).set(auth(student.token)).send({ lessonId: L2 });
  check('set current lesson -> 200', r.status === 200);
  r = await request(app).get(`/api/learn/${courseId}`).set(auth(student.token));
  check('learn payload returns saved currentLessonId', String(r.body.data.currentLessonId) === String(L2));

  console.log('\n[5] Progress summary');
  r = await request(app).get('/api/learn/progress/summary').set(auth(student.token));
  check('summary -> 200', r.status === 200);
  check('summary reports 67% for the course', r.body.progress[String(courseId)] === 67);
  r = await request(app).get('/api/learn/progress/summary');
  check('summary without token -> 401', r.status === 401);

  console.log('\n[6] Empty-curriculum course still works');
  const empty = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Empty Course', price: 0 });
  const emptyId = empty.body.data._id;
  await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId: emptyId });
  r = await request(app).get(`/api/learn/${emptyId}`).set(auth(student.token));
  check('empty course learn -> 200 with 0 lessons, 0%', r.status === 200 && r.body.data.totalLessons === 0 && r.body.data.percent === 0);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
