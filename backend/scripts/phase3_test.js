/**
 * Phase 3 payments integration test (dev-only). Runs the real Express app
 * against an in-memory MongoDB. Razorpay ORDER CREATION is mocked (no network,
 * no real transactions); signature VERIFICATION uses real HMAC-SHA256 with a
 * test secret. Email is stubbed so verified users can be created.
 *
 * Run:  node scripts/phase3_test.js
 */
process.env.JWT_SECRET = 'test_secret';
process.env.JWT_EXPIRES_IN = '7d';
process.env.OTP_EXPIRY_MINUTES = '10';
process.env.RAZORPAY_KEY_ID = 'rzp_test_ABC123';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_secret';

const crypto = require('crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ---- Mock the Razorpay SDK (order creation only) BEFORE the app requires it.
// The mock ENFORCES Razorpay's real 40-char `receipt` limit so a regression to
// an over-long receipt fails the suite (mirrors the production BAD_REQUEST_ERROR).
const capturedReceipts = [];
const rzpPath = require.resolve('razorpay');
require.cache[rzpPath] = {
  id: rzpPath,
  filename: rzpPath,
  loaded: true,
  exports: class MockRazorpay {
    constructor() {
      this.orders = {
        create: async (opts) => {
          capturedReceipts.push(opts.receipt);
          if (typeof opts.receipt === 'string' && opts.receipt.length > 40) {
            const err = new Error('receipt: the length must be between 1 and 40.');
            err.statusCode = 400; // Razorpay returns HTTP 400 BAD_REQUEST_ERROR
            throw err;
          }
          return {
            id: 'order_' + crypto.randomBytes(8).toString('hex'),
            amount: opts.amount,
            currency: opts.currency,
            receipt: opts.receipt,
            status: 'created',
          };
        },
      };
    }
  },
};

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS -', name); }
  else { fail += 1; console.log('  FAIL -', name); }
};

const sign = (orderId, paymentId) =>
  crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

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
  const Payment = require('../models/Payment');

  await connectDB();
  await Enrolled.syncIndexes();
  await Payment.syncIndexes();

  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  const makeUser = async (fullName, mail) => {
    await request(app).post('/api/auth/register').send({ fullName, email: mail, password: 'secret123' });
    const v = await request(app).post('/api/auth/verify-otp').send({ email: mail, otp: otpBox[mail] });
    return { token: v.body.token, id: v.body.data._id };
  };

  const admin = await makeUser('Admin', 'admin@ex.com');
  await User.updateOne({ email: 'admin@ex.com' }, { role: 'admin' });
  const studentA = await makeUser('Student A', 'a@ex.com');
  const studentB = await makeUser('Student B', 'b@ex.com');

  // Courses
  let r = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Paid Course', price: 1299 });
  const paidId = r.body.data._id;
  r = await request(app).post('/api/courses').set(auth(admin.token)).send({ title: 'Free Course', price: 0 });
  const freeId = r.body.data._id;

  console.log('\n[1] create-order auth + server-authoritative amount');
  r = await request(app).post('/api/payments/create-order').send({ courseId: paidId });
  check('create-order without token -> 401', r.status === 401);
  r = await request(app).post('/api/payments/create-order').set(auth(studentA.token)).send({ courseId: 'bad' });
  check('invalid courseId -> 400', r.status === 400);
  r = await request(app).post('/api/payments/create-order').set(auth(studentA.token)).send({ courseId: '64b64c14b4a1e2a1c8f00000' });
  check('nonexistent course -> 404', r.status === 404);
  r = await request(app).post('/api/payments/create-order').set(auth(studentA.token)).send({ courseId: freeId });
  check('free course create-order -> 400', r.status === 400);

  r = await request(app).post('/api/payments/create-order').set(auth(studentA.token)).send({ courseId: paidId });
  check('create-order (paid) -> 201', r.status === 201);
  check('amount from DB price in paise (1299 -> 129900)', r.body.data.amount === 129900);
  check('currency INR', r.body.data.currency === 'INR');
  check('returns TEST key id only (rzp_test_)', /^rzp_test_/.test(r.body.data.key));
  check('orderId present', typeof r.body.data.orderId === 'string' && r.body.data.orderId.startsWith('order_'));
  const orderA = r.body.data.orderId;

  r = await request(app).post('/api/payments/create-order').set(auth(studentA.token)).send({ courseId: paidId, amount: 1 });
  check('client-supplied amount is IGNORED (still 129900)', r.body.data.amount === 129900);

  const created = await Payment.findOne({ orderId: orderA });
  check('Payment record created with status "created"', created && created.status === 'created' && created.amount === 129900);

  // Razorpay caps `receipt` at 40 chars; ensure every generated receipt fits.
  check('generated receipt(s) <= 40 chars (Razorpay limit)',
    capturedReceipts.length > 0 && capturedReceipts.every((r) => typeof r === 'string' && r.length <= 40));

  console.log('\n[2] verify (valid signature) -> paid + access granted');
  r = await request(app).post('/api/payments/verify').set(auth(studentA.token))
    .send({ orderId: orderA, paymentId: 'pay_A1', signature: sign(orderA, 'pay_A1') });
  check('verify valid -> 200', r.status === 200 && r.body.success === true);
  const paidRec = await Payment.findOne({ orderId: orderA });
  check('payment status -> paid', paidRec.status === 'paid' && paidRec.paymentId === 'pay_A1');
  const enrolledA = await Enrolled.findOne({ userId: studentA.id, courseId: paidId });
  check('access granted (Enrolled created)', Boolean(enrolledA));
  r = await request(app).get(`/api/payments/status/${paidId}`).set(auth(studentA.token));
  check('purchased status true for buyer', r.status === 200 && r.body.purchased === true);

  console.log('\n[3] invalid / tampered / wrong order -> rejected');
  r = await request(app).post('/api/payments/create-order').set(auth(studentB.token)).send({ courseId: paidId });
  const orderB = r.body.data.orderId;
  r = await request(app).post('/api/payments/verify').set(auth(studentB.token))
    .send({ orderId: orderB, paymentId: 'pay_B1', signature: 'deadbeef' });
  check('tampered signature -> 400', r.status === 400);
  const failedRec = await Payment.findOne({ orderId: orderB });
  check('tampered payment marked failed', failedRec.status === 'failed');
  check('no access granted on failure', !(await Enrolled.findOne({ userId: studentB.id, courseId: paidId })));
  r = await request(app).post('/api/payments/verify').set(auth(studentB.token))
    .send({ orderId: 'order_nonexistent', paymentId: 'x', signature: sign('order_nonexistent', 'x') });
  check('unknown orderId -> 400 (order not found)', r.status === 400);
  // Cross-user: B cannot verify A's order.
  r = await request(app).post('/api/payments/verify').set(auth(studentB.token))
    .send({ orderId: orderA, paymentId: 'pay_A1', signature: sign(orderA, 'pay_A1') });
  check('user cannot verify another user order -> 400', r.status === 400);

  console.log('\n[4] idempotent verification (no duplicate grant)');
  r = await request(app).post('/api/payments/verify').set(auth(studentA.token))
    .send({ orderId: orderA, paymentId: 'pay_A1', signature: sign(orderA, 'pay_A1') });
  check('duplicate verify -> 200 (idempotent)', r.status === 200);
  check('no duplicate enrollment', (await Enrolled.countDocuments({ userId: studentA.id, courseId: paidId })) === 1);
  check('no duplicate payment record', (await Payment.countDocuments({ orderId: orderA })) === 1);

  console.log('\n[5] purchased status is per-authenticated-user');
  r = await request(app).get(`/api/payments/status/${paidId}`).set(auth(studentB.token));
  check('other user status false (cannot see A\'s purchase)', r.status === 200 && r.body.purchased === false);
  r = await request(app).get(`/api/payments/status/${paidId}`);
  check('status without token -> 401', r.status === 401);

  console.log('\n[6] paid-course free-enrollment is blocked; free course works');
  r = await request(app).post('/api/courses/enroll').set(auth(studentB.token)).send({ courseId: paidId });
  check('free-enroll of PAID course -> 403 (payment required)', r.status === 403);
  check('paid course NOT enrolled via free path', !(await Enrolled.findOne({ userId: studentB.id, courseId: paidId })));
  r = await request(app).post('/api/courses/enroll').set(auth(studentB.token)).send({ courseId: freeId });
  check('free course enroll -> 201', r.status === 201);
  r = await request(app).post('/api/courses/enroll').set(auth(studentB.token)).send({ courseId: freeId });
  check('duplicate free enroll -> 409 (unique index intact)', r.status === 409);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
