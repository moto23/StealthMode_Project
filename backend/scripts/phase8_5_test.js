/**
 * Phase 8.5 — Automated Course Content Seeding integration test (dev-only).
 *
 * Covers: admin-only auto-generate (401/403/200), curriculum generated from
 * real metadata, embeddable videos attached, idempotency (rerun does not
 * duplicate and preserves already-valid videos), preservation of manual
 * lessons, malformed/absent provider responses (graceful → missing-video),
 * publish gating on broken/non-embeddable references, external-embed playback
 * (auth-gated; Mux signed playback untouched), and public-catalog sanitization.
 *
 * The video provider (videoSourceService) is stubbed so the REAL generator +
 * idempotent merge + persistence run deterministically with no network.
 *
 * Run:  node scripts/phase8_5_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';

const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Mux signing key so the (untouched) Mux playback branch still works.
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
process.env.MUX_SIGNING_KEY_ID = 'test-signing-key';
process.env.MUX_SIGNING_KEY_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

// ---- Stub the approved video-source provider ----
const videoSourceService = require('../services/videoSourceService');
const stub = { mode: 'good', idPrefix: 'A' }; // good | malformed | none | unconfigured
videoSourceService.isConfigured = () => stub.mode !== 'unconfigured';
videoSourceService.pickBest = async (query) => {
  if (stub.mode === 'unconfigured' || stub.mode === 'none') return null;
  if (stub.mode === 'malformed') return { provider: 'youtube', embeddable: false }; // junk, no ids
  const id = `${stub.idPrefix}_${Buffer.from(String(query)).toString('hex').slice(0, 10)}`;
  return {
    provider: 'youtube',
    sourceId: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    embeddable: true,
    license: 'creativeCommon',
    sourceTitle: `Lesson video: ${String(query).slice(0, 24)}`,
    duration: 480,
  };
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
  const outsider = await makeUser('Outsider', 'outsider@example.com');
  const admin = await makeUser('Admin', 'admin@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });

  const mkCourse = async (title, price) =>
    (await request(app).post('/api/courses').set(auth(admin.token)).send({ title, price, category: 'Web', level: 'Beginner' })).body.data._id;
  const getCur = async (id) => (await request(app).get(`/api/courses/${id}/curriculum`).set(auth(admin.token))).body.data;
  const putCur = (id, sections) => request(app).put(`/api/courses/${id}/curriculum`).set(auth(admin.token)).send({ sections });
  const toPayload = (sections) =>
    sections.map((s) => ({
      title: s.title,
      lessons: (s.lessons || []).map((l) => ({
        title: l.title, description: l.description, duration: l.duration,
        isPreview: l.isPreview, generated: l.generated, autoKey: l.autoKey, video: l.video,
      })),
    }));
  const gen = (id, mode) => request(app).post(`/api/courses/${id}/auto-generate`).set(auth(admin.token)).send(mode ? { mode } : {});

  const courseId = await mkCourse('Node.js APIs', 999);

  console.log('\n[1] Authorization + first generation');
  let r = await request(app).post(`/api/courses/${courseId}/auto-generate`);
  check('auto-generate without token -> 401', r.status === 401);
  r = await request(app).post(`/api/courses/${courseId}/auto-generate`).set(auth(student.token));
  check('auto-generate as non-admin -> 403', r.status === 403);
  stub.mode = 'good'; stub.idPrefix = 'A';
  r = await gen(courseId, 'fill');
  check('admin auto-generate -> 200 with report', r.status === 200 && r.body.data.report);
  const rep = r.body.data.report;
  check('curriculum generated from metadata (4 sections, 11 lessons)', rep.sectionCount === 4 && rep.lessonCount === 11);
  check('every lesson marked generated', rep.generatedCount === 11);
  check('all lessons got an embeddable video', rep.withVideoCount === 11 && rep.missingVideo.length === 0);
  check('report marks provider configured', rep.providerConfigured === true);
  let cur = await getCur(courseId);
  const firstLesson = cur.sections[0].lessons[0];
  check('lesson video is youtube + embeddable', firstLesson.video.provider === 'youtube' && firstLesson.video.embeddable === true);
  check('duration derived from real provider seconds (8:00)', firstLesson.duration === '8:00');
  check('lesson carries description + autoKey', !!firstLesson.description && !!firstLesson.autoKey);
  const firstSourceId = firstLesson.video.sourceId;
  check('sourceId came from provider (prefix A)', firstSourceId.startsWith('A_'));

  console.log('\n[2] Idempotency + duplicate prevention + video preservation');
  stub.idPrefix = 'B'; // a re-fetch would now yield different ids
  r = await gen(courseId, 'fill');
  check('re-run fill -> 200', r.status === 200);
  cur = await getCur(courseId);
  check('no duplicate sections after re-run (still 4)', cur.sections.length === 4);
  const lessonCount = cur.sections.reduce((n, s) => n + s.lessons.length, 0);
  check('no duplicate lessons after re-run (still 11)', lessonCount === 11);
  check('existing valid video preserved (still prefix A, not B)', cur.sections[0].lessons[0].video.sourceId === firstSourceId);

  console.log('\n[3] Preservation of manual lessons');
  const withManual = toPayload(cur.sections);
  withManual[0].lessons.push({ title: 'Manual: instructor notes', isPreview: false }); // no autoKey/generated
  await putCur(courseId, withManual);
  stub.idPrefix = 'A';
  r = await gen(courseId, 'fill');
  cur = await getCur(courseId);
  const allTitles = cur.sections.flatMap((s) => s.lessons.map((l) => l.title));
  check('manual lesson preserved across regenerate', allTitles.filter((t) => t === 'Manual: instructor notes').length === 1);
  check('no generated-lesson duplication after manual + regen', cur.sections[0].lessons.filter((l) => l.autoKey === cur.sections[0].lessons[0].autoKey).length === 1);

  console.log('\n[4] Malformed provider response (graceful)');
  const cMal = await mkCourse('Malformed Course', 100);
  stub.mode = 'malformed';
  r = await gen(cMal, 'fill');
  check('malformed provider -> 200 (no crash)', r.status === 200);
  check('lessons flagged missing-video, none valid', r.body.data.report.withVideoCount === 0 && r.body.data.report.missingVideo.length === r.body.data.report.lessonCount);
  check('curriculum structure still generated (4 sections)', r.body.data.report.sectionCount === 4);
  stub.mode = 'good';

  console.log('\n[5] Provider not configured (still generates structure)');
  const cUnconf = await mkCourse('Unconfigured Course', 100);
  stub.mode = 'unconfigured';
  r = await gen(cUnconf, 'fill');
  check('unconfigured provider -> 200, providerConfigured false', r.status === 200 && r.body.data.report.providerConfigured === false);
  check('all lessons missing video when no provider', r.body.data.report.withVideoCount === 0);
  stub.mode = 'good';

  console.log('\n[6] Publish gating on video references');
  // Seeded (embeddable) course publishes fine.
  r = await request(app).post(`/api/courses/${courseId}/publish`).set(auth(admin.token));
  check('course with embeddable videos publishes -> 200', r.status === 200);
  // Broken external reference (embeddable:false) blocks publish.
  const cBroken = await mkCourse('Broken Ref', 100);
  await putCur(cBroken, [{ title: 'S', lessons: [{ title: 'L', video: { provider: 'youtube', sourceId: 'x', url: 'https://y', embedUrl: 'https://www.youtube-nocookie.com/embed/x', embeddable: false } }] }]);
  r = await request(app).post(`/api/courses/${cBroken}/publish`).set(auth(admin.token));
  check('non-embeddable external ref blocks publish -> 400', r.status === 400 && r.body.issues.some((m) => /embedd/i.test(m)));
  // Unsupported provider blocks publish.
  const cVimeo = await mkCourse('Unsupported Provider', 100);
  await putCur(cVimeo, [{ title: 'S', lessons: [{ title: 'L', video: { provider: 'vimeo', sourceId: 'v1', embedUrl: 'https://player.vimeo.com/video/v1', embeddable: true } }] }]);
  r = await request(app).post(`/api/courses/${cVimeo}/publish`).set(auth(admin.token));
  check('unsupported provider blocks publish -> 400', r.status === 400 && r.body.issues.some((m) => /unsupported/i.test(m)));

  console.log('\n[7] External embed playback (auth-gated) + Mux untouched');
  const cPlay = await mkCourse('Playback Course', 0); // free → student can self-enroll
  stub.mode = 'good';
  await gen(cPlay, 'fill');
  let pcur = await getCur(cPlay);
  // Mark first lesson preview; give last lesson a Mux video (regression).
  const payload = toPayload(pcur.sections);
  payload[0].lessons[0].isPreview = true;
  payload[payload.length - 1].lessons[0].video = { provider: 'mux', playbackId: 'pbid_mux_1', status: 'ready', policy: 'signed' };
  await putCur(cPlay, payload);
  pcur = await getCur(cPlay);
  const previewId = pcur.sections[0].lessons[0]._id;
  const protectedId = pcur.sections[1].lessons[0]._id;
  const muxLessonId = pcur.sections[pcur.sections.length - 1].lessons[0]._id;
  await request(app).post('/api/courses/enroll').set(auth(student.token)).send({ courseId: cPlay });

  r = await request(app).get(`/api/learn/${cPlay}/lessons/${protectedId}/playback`);
  check('external playback without token -> 401', r.status === 401);
  r = await request(app).get(`/api/learn/${cPlay}/lessons/${protectedId}/playback`).set(auth(student.token));
  check('enrolled external playback -> 200 with embedUrl (no token)', r.status === 200 && r.body.data.provider === 'youtube' && /youtube-nocookie/.test(r.body.data.embedUrl) && !r.body.data.token);
  r = await request(app).get(`/api/learn/${cPlay}/lessons/${previewId}/playback`).set(auth(outsider.token));
  check('preview external playback (non-enrolled) -> 200', r.status === 200 && r.body.data.provider === 'youtube');
  r = await request(app).get(`/api/learn/${cPlay}/lessons/${protectedId}/playback`).set(auth(outsider.token));
  check('protected external playback (non-enrolled) -> 403', r.status === 403);
  r = await request(app).get(`/api/learn/${cPlay}/lessons/${muxLessonId}/playback`).set(auth(student.token));
  check('Mux lesson still returns signed token (path untouched)', r.status === 200 && r.body.data.provider === 'mux' && typeof r.body.data.token === 'string');

  console.log('\n[8] Public catalog sanitization for external embeds');
  await request(app).post(`/api/courses/${cPlay}/publish`).set(auth(admin.token));
  r = await request(app).get(`/api/courses/${cPlay}`);
  const pub = r.body.sections;
  const pubPreview = pub[0].lessons[0];
  const pubProtected = pub[1].lessons[0];
  check('preview external lesson exposes embedUrl publicly', pubPreview.video && /youtube-nocookie/.test(pubPreview.video.embedUrl));
  check('protected external lesson exposes NO video publicly', pubProtected.video === undefined);

  console.log('\n[9] Replace mode');
  stub.idPrefix = 'C';
  r = await gen(cPlay, 'replace');
  cur = await getCur(cPlay);
  const manualGone = !cur.sections.flatMap((s) => s.lessons).some((l) => l.title === 'Manual: instructor notes');
  check('replace mode regenerates fresh curriculum', r.status === 200 && cur.sections.length === 4 && manualGone);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
