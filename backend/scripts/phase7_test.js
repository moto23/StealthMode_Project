/**
 * Phase 7 — Slice 1 (Curriculum foundation) integration test (dev-only).
 * Runs the real Express app against an in-memory MongoDB, stubbing email.
 * Covers: admin-only curriculum authorization (401/403/200), structure
 * validation (400), bulk replace + reorder, admin full read (video handles
 * visible), and PUBLIC protected-video stripping (playbackId hidden for
 * non-preview lessons, kept for preview lessons).
 *
 * Run:  node scripts/phase7_test.js
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

  await connectDB();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const student = await makeUser('Student One', 'student@example.com');
  const admin = await makeUser('Admin User', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  // A course to attach curriculum to.
  const created = await request(app)
    .post('/api/courses')
    .set(auth(admin.token))
    .send({ title: 'Phase 7 Course', price: 999 });
  const courseId = created.body.data._id;

  // A valid curriculum: 2 sections; section 1 has a PREVIEW lesson (with video)
  // and a NON-preview lesson (with video) to exercise the stripping.
  const curriculum = {
    sections: [
      {
        title: 'Getting Started',
        lessons: [
          { title: 'Welcome (free preview)', duration: '3:10', isPreview: true, video: { provider: 'mux', playbackId: 'PREVIEW_PB', assetId: 'PREVIEW_ASSET' } },
          { title: 'Protected Lesson', duration: '9:00', isPreview: false, video: { provider: 'mux', playbackId: 'SECRET_PB', assetId: 'SECRET_ASSET' } },
        ],
      },
      { title: 'Deep Dive', lessons: [{ title: 'Advanced Topic', duration: '15:00' }] },
    ],
  };

  console.log('\n[1] Curriculum write authorization (protect + requireRole admin)');
  let r = await request(app).put(`/api/courses/${courseId}/curriculum`).send(curriculum);
  check('PUT curriculum without token -> 401', r.status === 401);
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(student.token)).send(curriculum);
  check('PUT curriculum as student -> 403', r.status === 403);
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send(curriculum);
  check('PUT curriculum as admin -> 200', r.status === 200 && r.body.success === true);
  check('two sections saved', Array.isArray(r.body.data.sections) && r.body.data.sections.length === 2);

  console.log('\n[2] Curriculum read authorization');
  r = await request(app).get(`/api/courses/${courseId}/curriculum`);
  check('GET curriculum without token -> 401', r.status === 401);
  r = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(student.token));
  check('GET curriculum as student -> 403', r.status === 403);
  r = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  check('GET curriculum as admin -> 200', r.status === 200);
  const adminSection = r.body.data.sections[0];
  check('admin read exposes protected playbackId (for editing)',
    adminSection.lessons[1].video && adminSection.lessons[1].video.playbackId === 'SECRET_PB');

  console.log('\n[3] Structure validation (400)');
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({ sections: 'nope' });
  check('sections not an array -> 400', r.status === 400);
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({ sections: [{ lessons: [] }] });
  check('section without title -> 400', r.status === 400);
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({ sections: [{ title: 'S', lessons: [{ duration: '1:00' }] }] });
  check('lesson without title -> 400', r.status === 400);
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({ sections: [{ title: 'S', lessons: 'bad' }] });
  check('lessons not an array -> 400', r.status === 400);
  // Re-assert the valid curriculum is still intact after the failed writes.
  r = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  check('valid curriculum preserved after failed writes', r.body.data.sections.length === 2);

  console.log('\n[4] PUBLIC read strips protected video for NON-preview lessons');
  r = await request(app).get(`/api/courses/${courseId}`);
  check('GET /api/courses/:id -> 200 raw object', r.status === 200 && r.body.title === 'Phase 7 Course' && r.body.success === undefined);
  const pubSection = r.body.sections[0];
  const previewLesson = pubSection.lessons[0];
  const protectedLesson = pubSection.lessons[1];
  check('preview lesson KEEPS its video/playbackId', previewLesson.video && previewLesson.video.playbackId === 'PREVIEW_PB');
  check('non-preview lesson has NO video handle exposed', protectedLesson.video === undefined);
  check('lesson titles/duration still present publicly', protectedLesson.title === 'Protected Lesson' && protectedLesson.duration === '9:00');

  console.log('\n[5] PUBLIC list also strips protected video');
  // Phase 8: new courses default to draft; publish so it appears in the public
  // catalog (curriculum stripping behaviour is what this section verifies).
  await request(app).post(`/api/courses/${courseId}/publish`).set(auth(admin.token));
  r = await request(app).get('/api/courses');
  const listed = r.body.find((c) => String(c._id) === String(courseId));
  check('GET /api/courses -> 200 raw array', r.status === 200 && Array.isArray(r.body));
  check('listed course strips non-preview playbackId', listed && listed.sections[0].lessons[1].video === undefined);
  check('listed course keeps preview playbackId', listed && listed.sections[0].lessons[0].video.playbackId === 'PREVIEW_PB');

  console.log('\n[6] Existing course behavior intact (create/edit/delete untouched)');
  r = await request(app).put(`/api/courses/${courseId}`).set(auth(admin.token)).send({ price: 1499 });
  check('admin edit still works -> 200', r.status === 200 && r.body.data.price === 1499);
  check('edit did not clobber curriculum', Array.isArray(r.body.data.sections) && r.body.data.sections.length === 2);

  console.log('\n[7] Reorder via bulk replace');
  const reordered = {
    sections: [
      { title: 'Deep Dive', lessons: [{ title: 'Advanced Topic' }] },
      { title: 'Getting Started', lessons: [{ title: 'Welcome (free preview)', isPreview: true }] },
    ],
  };
  r = await request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send(reordered);
  check('reorder saved -> 200', r.status === 200 && r.body.data.sections[0].title === 'Deep Dive');

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
