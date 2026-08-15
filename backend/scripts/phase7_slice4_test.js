/**
 * Phase 7 — Slice 4 (Protected Mux video playback) integration test (dev-only).
 * Covers: unauthenticated -> 401, expired/invalid auth -> 401, non-enrolled ->
 * 403 (protected), preview lesson playable without enrollment, id validation
 * (400), course/lesson-not-found and cross-course lesson (404), lesson without
 * video (404), enrolled user -> valid RS256 signed token (sub=playbackId,
 * aud=v, kid matches, exp in future), and NO leakage of the Mux asset id or
 * signing key. No fabricated metadata.
 *
 * Run:  node scripts/phase7_slice4_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ---- Configure a throwaway Mux signing key (RSA) for this test process ----
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const SIGNING_KEY_ID = 'test-signing-key-id';
process.env.MUX_SIGNING_KEY_ID = SIGNING_KEY_ID;
process.env.MUX_SIGNING_KEY_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');
process.env.MUX_TOKEN_EXPIRY_SECONDS = '600';

const PREVIEW_ASSET = 'asset_preview_should_not_leak';
const PREVIEW_PBID = 'pbid_preview_signed';
const PROTECTED_ASSET = 'asset_protected_should_not_leak';
const PROTECTED_PBID = 'pbid_protected_signed';

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

  await connectDB();
  await Enrolled.syncIndexes();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const playURL = (cid, lid) => `/api/learn/${cid}/lessons/${lid}/playback`;

  const student = await makeUser('Learner One', 'learner@example.com');
  const outsider = await makeUser('Outsider O', 'outsider@example.com');
  const admin = await makeUser('Admin User', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  // Course A: preview + protected + no-video lessons.
  const cA = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Mux Course A', price: 0 });
  const courseA = cA.body.data._id;
  await request(app).put(`/api/courses/${courseA}/curriculum`).set(auth(admin.token)).send({
    sections: [
      {
        title: 'Section 1',
        lessons: [
          { title: 'Preview Lesson', isPreview: true, video: { provider: 'mux', assetId: PREVIEW_ASSET, playbackId: PREVIEW_PBID } },
          { title: 'Protected Lesson', video: { provider: 'mux', assetId: PROTECTED_ASSET, playbackId: PROTECTED_PBID } },
          { title: 'No Video Lesson' },
          { title: 'Long Lesson', duration: '90 min', video: { provider: 'mux', assetId: 'asset_long', playbackId: 'pbid_long_signed' } },
        ],
      },
    ],
  });
  const curA = await request(app).get(`/api/courses/${courseA}/curriculum`).set(auth(admin.token));
  const [previewId, protectedId, noVideoId, longId] = curA.body.data.sections[0].lessons.map((l) => l._id);

  // Course B: one lesson (used to prove cross-course lessons are rejected).
  const cB = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Mux Course B', price: 0 });
  const courseB = cB.body.data._id;
  await request(app).put(`/api/courses/${courseB}/curriculum`).set(auth(admin.token)).send({
    sections: [{ title: 'B', lessons: [{ title: 'B Lesson', video: { provider: 'mux', assetId: 'asset_b', playbackId: 'pbid_b' } }] }],
  });
  const curB = await request(app).get(`/api/courses/${courseB}/curriculum`).set(auth(admin.token));
  const bLessonId = curB.body.data.sections[0].lessons[0]._id;

  // Student enrolls in A only.
  await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId: courseA });

  console.log('\n[1] Authentication gate');
  let r = await request(app).get(playURL(courseA, protectedId));
  check('no token -> 401', r.status === 401);
  const expiredToken = jwt.sign({ id: student.id }, process.env.JWT_SECRET, { expiresIn: '-10s' });
  r = await request(app).get(playURL(courseA, protectedId)).set(auth(expiredToken));
  check('expired auth token -> 401', r.status === 401);
  r = await request(app).get(playURL(courseA, protectedId)).set({ Authorization: 'Bearer not.a.jwt' });
  check('garbage auth token -> 401', r.status === 401);

  console.log('\n[2] Enrollment gate (protected vs preview)');
  r = await request(app).get(playURL(courseA, protectedId)).set(auth(outsider.token));
  check('non-enrolled + protected lesson -> 403', r.status === 403);
  r = await request(app).get(playURL(courseA, previewId)).set(auth(outsider.token));
  check('non-enrolled + PREVIEW lesson -> 200 (preview is open)', r.status === 200);
  check('preview token subject = preview playbackId', (() => {
    try { return jwt.verify(r.body.data.token, publicKey, { algorithms: ['RS256'] }).sub === PREVIEW_PBID; }
    catch { return false; }
  })());

  console.log('\n[3] Id validation + lesson-belongs-to-course');
  r = await request(app).get(playURL('not-an-object-id', protectedId)).set(auth(student.token));
  check('invalid course id -> 400', r.status === 400);
  r = await request(app).get(playURL(courseA, 'not-an-object-id')).set(auth(student.token));
  check('invalid lesson id -> 400', r.status === 400);
  r = await request(app).get(playURL('64b64c14b4a1e2a1c8f00000', protectedId)).set(auth(student.token));
  check('nonexistent course -> 404', r.status === 404);
  r = await request(app).get(playURL(courseA, '64b64c14b4a1e2a1c8f00000')).set(auth(student.token));
  check('lesson id not in any course -> 404', r.status === 404);
  r = await request(app).get(playURL(courseA, bLessonId)).set(auth(student.token));
  check("another course's lesson -> 404 (belongs-to-course enforced)", r.status === 404);
  r = await request(app).get(playURL(courseA, noVideoId)).set(auth(student.token));
  check('lesson without video -> 404', r.status === 404);

  console.log('\n[4] Enrolled user -> valid signed playback token');
  r = await request(app).get(playURL(courseA, protectedId)).set(auth(student.token));
  check('enrolled + protected lesson -> 200', r.status === 200);
  check('response exposes provider=mux + playbackId + expiresIn', r.body.data.provider === 'mux' && r.body.data.playbackId === PROTECTED_PBID && Number(r.body.data.expiresIn) > 0);
  let decoded = null;
  let header = null;
  try {
    decoded = jwt.verify(r.body.data.token, publicKey, { algorithms: ['RS256'] });
    header = jwt.decode(r.body.data.token, { complete: true }).header;
  } catch { /* leave null */ }
  check('token is a valid RS256 JWT signed by the signing key', decoded !== null);
  check('token.sub = protected playbackId', decoded && decoded.sub === PROTECTED_PBID);
  check('token.aud = "v" (video)', decoded && decoded.aud === 'v');
  check('token.exp is in the future', decoded && decoded.exp * 1000 > Date.now());
  check('token header.kid = signing key id', header && header.kid === SIGNING_KEY_ID);
  check('token rejected by a WRONG public key (signature is real)', (() => {
    const wrong = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } }).publicKey;
    try { jwt.verify(r.body.data.token, wrong, { algorithms: ['RS256'] }); return false; } catch { return true; }
  })());

  console.log('\n[5] Duration-aware token expiry (Mux: exp > now + duration)');
  // Floor is 600s (MUX_TOKEN_EXPIRY_SECONDS). A 90-min lesson (5400s) must get a
  // token that outlives it: max(600, 5400 + 1800 cushion) = 7200s.
  r = await request(app).get(playURL(courseA, longId)).set(auth(student.token));
  check('long lesson -> 200', r.status === 200);
  check('long-lesson token expiresIn covers duration + cushion (7200s)', r.body.data.expiresIn === 7200);
  check('long-lesson token exp actually exceeds now + 90min', (() => {
    try {
      const d = jwt.verify(r.body.data.token, publicKey, { algorithms: ['RS256'] });
      return d.exp * 1000 > Date.now() + 90 * 60 * 1000;
    } catch { return false; }
  })());
  // Short/unknown-duration lesson falls back to the floor (600s), not extended.
  const shortR = await request(app).get(playURL(courseA, protectedId)).set(auth(student.token));
  check('no-duration lesson uses the floor ttl (600s)', shortR.body.data.expiresIn === 600);

  console.log('\n[6] No credential / raw-metadata leakage');
  const body = JSON.stringify(shortR.body);
  check('response does NOT contain the Mux asset id', !body.includes(PROTECTED_ASSET));
  check('response does NOT contain a private key PEM', !body.includes('BEGIN') && !body.includes(process.env.MUX_SIGNING_KEY_PRIVATE_KEY));
  const learn = await request(app).get(`/api/learn/${courseA}`).set(auth(student.token));
  const anyVideoField = learn.body.data.sections.some((s) => s.lessons.some((l) => l.video !== undefined || l.assetId !== undefined));
  check('learn curriculum payload carries no video/asset handles', !anyVideoField);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
