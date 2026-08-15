/**
 * Phase 8 — Course Content & Video Management integration test (dev-only).
 *
 * Covers: admin-only Mux Direct Upload creation (401/403/201), SIGNED playback
 * policy in the upload request, upload→asset status resolution, asset/video
 * metadata persistence via the curriculum API, replace/remove video, publish
 * gating (no curriculum / processing video / missing price → rejected; valid →
 * published and visible in the public catalog), draft courses hidden from the
 * catalog, legacy (statusless) courses stay visible, transcript gating, and
 * that Mux asset ids / credentials never leak to clients.
 *
 * The Mux REST API is stubbed at the axios boundary so the REAL muxAssetService
 * logic runs (we assert the exact request it sends), with no network calls.
 *
 * Run:  node scripts/phase8_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';
// Mux API creds (fake — the axios layer is stubbed, so these are never used to auth).
process.env.MUX_TOKEN_ID = 'test_token_id';
process.env.MUX_TOKEN_SECRET = 'test_token_secret_SHOULD_NEVER_LEAK';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const axios = require('axios');

// Signing key for transcript token minting (reuses muxService).
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
process.env.MUX_SIGNING_KEY_ID = 'test-signing-key';
process.env.MUX_SIGNING_KEY_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

// ---- Stub the Mux REST API at the axios boundary ----
const captured = { posts: [], gets: [] };
let assetReady = true; // toggle to simulate a still-processing asset
const ASSET = {
  id: 'asset_XYZ_SECRET',
  status: 'ready',
  playback_ids: [{ id: 'pbid_signed_1', policy: 'signed' }],
  duration: 123.4,
  tracks: [
    { id: 'track_en_1', type: 'text', text_type: 'subtitles', language_code: 'en', name: 'English', status: 'ready', text_source: 'generated_vod' },
  ],
};
axios.create = () => ({
  post: async (url, body) => {
    captured.posts.push({ url, body });
    if (url === '/video/v1/uploads') {
      return { data: { data: { id: 'upload_ABC', url: 'https://storage.googleapis.com/mux-uploads/put-here', status: 'waiting' } } };
    }
    if (url.includes('/tracks')) {
      return { data: { data: { id: 'track_new', language_code: 'en', name: 'English', status: 'preparing' } } };
    }
    throw new Error('unexpected POST ' + url);
  },
  get: async (url) => {
    captured.gets.push(url);
    if (url.startsWith('/video/v1/uploads/')) {
      return { data: { data: { id: 'upload_ABC', status: 'asset_created', asset_id: ASSET.id } } };
    }
    if (url.startsWith('/video/v1/assets/')) {
      return { data: { data: { ...ASSET, status: assetReady ? 'ready' : 'preparing' } } };
    }
    throw new Error('unexpected GET ' + url);
  },
});
// Transcript fetch uses axios.get directly.
axios.get = async (url) => {
  captured.transcriptUrl = url;
  return { data: 'Welcome to the lesson.\nThis is a real Mux transcript.' };
};

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
  const Course = require('../models/Course');
  const Enrolled = require('../models/Enrolled');

  await connectDB();
  await Enrolled.syncIndexes();

  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };
  const auth = (t) => ({ Authorization: `Bearer ${t}` });

  const student = await makeUser('Learner', 'learner@example.com');
  const admin = await makeUser('Admin', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  const c = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Phase 8 Course', price: 999 });
  const courseId = c.body.data._id;

  console.log('\n[1] Admin-only Direct Upload creation + SIGNED policy');
  let r = await request(app).post(`/api/courses/${courseId}/video/uploads`);
  check('create upload without token -> 401', r.status === 401);
  r = await request(app).post(`/api/courses/${courseId}/video/uploads`).set(auth(student.token));
  check('create upload as non-admin -> 403', r.status === 403);
  r = await request(app).post(`/api/courses/${courseId}/video/uploads`).set(auth(admin.token));
  check('admin create upload -> 201 with { uploadId, url }', r.status === 201 && r.body.data.uploadId === 'upload_ABC' && typeof r.body.data.url === 'string');
  const uploadReq = captured.posts.find((p) => p.url === '/video/v1/uploads');
  check('Mux upload requested SIGNED playback policy (not public)', !!uploadReq && Array.isArray(uploadReq.body.new_asset_settings.playback_policy) && uploadReq.body.new_asset_settings.playback_policy[0] === 'signed');
  check('upload response leaks no Mux credential', !JSON.stringify(r.body).includes(process.env.MUX_TOKEN_SECRET));

  console.log('\n[2] Upload status -> asset resolution');
  assetReady = true;
  r = await request(app).get(`/api/courses/${courseId}/video/uploads/upload_ABC`).set(auth(admin.token));
  check('status resolves to ready asset with signed playbackId', r.status === 200 && r.body.data.status === 'ready' && r.body.data.playbackId === 'pbid_signed_1' && r.body.data.policy === 'signed');
  check('status includes generated caption track', Array.isArray(r.body.data.captions) && r.body.data.captions[0].languageCode === 'en');
  r = await request(app).get(`/api/courses/${courseId}/video/uploads/upload_ABC`).set(auth(student.token));
  check('status as non-admin -> 403', r.status === 403);

  console.log('\n[3] Persist video metadata via curriculum API (reuses Slice 1)');
  const videoPayload = {
    provider: 'mux', assetId: ASSET.id, playbackId: 'pbid_signed_1', uploadId: 'upload_ABC',
    status: 'ready', policy: 'signed', duration: 123,
    captions: [{ trackId: 'track_en_1', languageCode: 'en', name: 'English', status: 'ready' }],
  };
  const putCurriculum = (sections) => request(app).put(`/api/courses/${courseId}/curriculum`).set(auth(admin.token)).send({ sections });
  r = await putCurriculum([{ title: 'S1', lessons: [{ title: 'L1', duration: '2:03', video: videoPayload }] }]);
  check('save curriculum with rich video -> 200', r.status === 200);
  let cur = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  let savedVideo = cur.body.data.sections[0].lessons[0].video;
  check('assetId persisted', savedVideo.assetId === ASSET.id);
  check('playbackId + policy persisted', savedVideo.playbackId === 'pbid_signed_1' && savedVideo.policy === 'signed');
  check('status + uploadId persisted', savedVideo.status === 'ready' && savedVideo.uploadId === 'upload_ABC');
  check('captions persisted', Array.isArray(savedVideo.captions) && savedVideo.captions[0].trackId === 'track_en_1');
  const lessonId = cur.body.data.sections[0].lessons[0]._id;

  console.log('\n[4] Replace / remove video');
  r = await putCurriculum([{ title: 'S1', lessons: [{ title: 'L1', duration: '2:03', video: { ...videoPayload, playbackId: 'pbid_signed_REPLACED' } }] }]);
  cur = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  check('replace video updates playbackId', cur.body.data.sections[0].lessons[0].video.playbackId === 'pbid_signed_REPLACED');
  r = await putCurriculum([{ title: 'S1', lessons: [{ title: 'L1', duration: '2:03' }] }]); // no video
  cur = await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token));
  const noVid = cur.body.data.sections[0].lessons[0].video;
  check('remove video clears handles', !noVid || (!noVid.playbackId && !noVid.assetId));

  console.log('\n[5] Caption generation endpoint (admin-only)');
  r = await request(app).post(`/api/courses/${courseId}/video/assets/${ASSET.id}/captions`).set(auth(student.token)).send({});
  check('request captions as non-admin -> 403', r.status === 403);
  r = await request(app).post(`/api/courses/${courseId}/video/assets/${ASSET.id}/captions`).set(auth(admin.token)).send({ languageCode: 'en' });
  check('admin request captions -> 201 track', r.status === 201 && r.body.data.trackId === 'track_new');

  console.log('\n[6] Publishing gates');
  // restore a ready video for the publishable case
  await putCurriculum([{ title: 'S1', lessons: [{ title: 'L1', duration: '2:03', video: videoPayload }] }]);
  r = await request(app).get('/api/courses');
  check('draft course hidden from public catalog', r.status === 200 && !r.body.some((x) => x._id === courseId));
  r = await request(app).get(`/api/courses/${courseId}`);
  check('draft course still readable by id', r.status === 200 && r.body.title === 'Phase 8 Course');
  r = await request(app).post(`/api/courses/${courseId}/publish`).set(auth(student.token));
  check('publish as non-admin -> 403', r.status === 403);

  // Course with no curriculum -> cannot publish
  const empty = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Empty', price: 100 });
  r = await request(app).post(`/api/courses/${empty.body.data._id}/publish`).set(auth(admin.token));
  check('publish with no curriculum -> 400 + issues', r.status === 400 && Array.isArray(r.body.issues) && r.body.issues.length > 0);

  // Course with a processing video -> cannot publish
  const proc = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Processing', price: 100 });
  await request(app).put(`/api/courses/${proc.body.data._id}/curriculum`).set(auth(admin.token)).send({
    sections: [{ title: 'S', lessons: [{ title: 'L', video: { provider: 'mux', assetId: 'a', playbackId: 'p', status: 'preparing' } }] }],
  });
  r = await request(app).post(`/api/courses/${proc.body.data._id}/publish`).set(auth(admin.token));
  check('publish with processing video -> 400', r.status === 400 && r.body.issues.some((m) => /processing/i.test(m)));

  // Course with lessons but no price -> cannot publish (missing metadata)
  const noPrice = await Course.create({ title: 'No Price', slug: 'no-price-8', status: 'draft', sections: [{ title: 'S', order: 0, lessons: [{ title: 'L', order: 0 }] }] });
  r = await request(app).post(`/api/courses/${noPrice._id}/publish`).set(auth(admin.token));
  check('publish with no price -> 400 (missing metadata)', r.status === 400 && r.body.issues.some((m) => /price/i.test(m)));

  // Valid course -> publishes and appears in the public catalog
  r = await request(app).post(`/api/courses/${courseId}/publish`).set(auth(admin.token));
  check('valid course publishes -> 200', r.status === 200 && r.body.data.status === 'published');
  r = await request(app).get('/api/courses');
  check('published course now visible in public catalog', r.body.some((x) => x._id === courseId));

  // Unpublish -> back to draft, hidden again
  r = await request(app).post(`/api/courses/${courseId}/unpublish`).set(auth(admin.token));
  check('unpublish -> draft', r.status === 200 && r.body.data.status === 'draft');
  r = await request(app).get('/api/courses');
  check('unpublished course hidden again', !r.body.some((x) => x._id === courseId));

  console.log('\n[7] Backward compatibility (legacy statusless course)');
  const legacy = await Course.create({ title: 'Legacy Course', slug: 'legacy-course-8', price: 0 }); // no status field
  r = await request(app).get('/api/courses');
  check('legacy course (no status) stays visible in catalog', r.body.some((x) => x._id === String(legacy._id)));

  console.log('\n[8] Admin manage list (all incl. drafts)');
  r = await request(app).get('/api/courses/manage').set(auth(admin.token));
  check('admin manage list -> 200 includes draft', r.status === 200 && r.body.data.some((x) => x._id === courseId));
  r = await request(app).get('/api/courses/manage').set(auth(student.token));
  check('manage list as non-admin -> 403', r.status === 403);

  console.log('\n[9] Mux asset ids never leak to public / preview sanitize');
  // publish the course again for public read, then inspect the public payload
  await request(app).post(`/api/courses/${courseId}/publish`).set(auth(admin.token));
  r = await request(app).get(`/api/courses/${courseId}`);
  let body = JSON.stringify(r.body);
  check('public course JSON has no Mux asset id', !body.includes(ASSET.id));
  check('public course JSON has no uploadId', !body.includes('upload_ABC'));
  // preview lesson exposes only playbackId (no assetId/uploadId)
  await putCurriculum([{ title: 'S1', lessons: [{ title: 'Preview L', isPreview: true, video: videoPayload }] }]);
  r = await request(app).get(`/api/courses/${courseId}`);
  const pv = r.body.sections[0].lessons[0];
  check('preview lesson exposes playbackId', pv.video && pv.video.playbackId === 'pbid_signed_1');
  check('preview lesson hides assetId + uploadId', pv.video && pv.video.assetId === undefined && pv.video.uploadId === undefined);

  console.log('\n[10] Transcript (only when a ready caption track exists)');
  // Enroll the student in the course (curriculum currently has the preview lesson with captions).
  await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId });
  r = await request(app).get(`/api/learn/${courseId}/lessons/${cur.body.data.sections[0].lessons[0]._id}/transcript`);
  check('transcript without token -> 401', r.status === 401);
  // Preview lesson has a ready caption -> transcript returned (mocked Mux text)
  const previewLessonId = (await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token))).body.data.sections[0].lessons[0]._id;
  r = await request(app).get(`/api/learn/${courseId}/lessons/${previewLessonId}/transcript`).set(auth(student.token));
  check('transcript available -> 200 with real Mux text', r.status === 200 && r.body.data.available === true && r.body.data.text.includes('real Mux transcript'));
  // A lesson without captions -> 404
  await putCurriculum([{ title: 'S1', lessons: [{ title: 'No Caption', isPreview: true, video: { provider: 'mux', playbackId: 'pbid_x', policy: 'signed' } }] }]);
  const noCapId = (await request(app).get(`/api/courses/${courseId}/curriculum`).set(auth(admin.token))).body.data.sections[0].lessons[0]._id;
  r = await request(app).get(`/api/learn/${courseId}/lessons/${noCapId}/transcript`).set(auth(student.token));
  check('lesson without caption track -> 404', r.status === 404);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
