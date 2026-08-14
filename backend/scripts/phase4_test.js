/**
 * Phase 4 cart / multi-course checkout integration test (dev-only). Runs the
 * real Express app against an in-memory MongoDB. Razorpay order creation is
 * MOCKED (no network, no real transactions) and the mock ENFORCES the real
 * 40-char receipt limit and records every order so we can assert exactly ONE
 * Razorpay order is created per cart checkout. Signature verification uses real
 * HMAC-SHA256 with a test secret. Email is stubbed.
 *
 * Run:  node scripts/phase4_test.js
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
const createdOrders = []; // every orders.create() call is recorded here
const rzpPath = require.resolve('razorpay');
require.cache[rzpPath] = {
  id: rzpPath,
  filename: rzpPath,
  loaded: true,
  exports: class MockRazorpay {
    constructor() {
      this.orders = {
        create: async (opts) => {
          if (typeof opts.receipt === 'string' && opts.receipt.length > 40) {
            const err = new Error('receipt: the length must be between 1 and 40.');
            err.statusCode = 400;
            throw err;
          }
          const order = {
            id: 'order_' + crypto.randomBytes(8).toString('hex'),
            amount: opts.amount,
            currency: opts.currency,
            receipt: opts.receipt,
            status: 'created',
          };
          createdOrders.push({ amount: opts.amount, currency: opts.currency, receipt: opts.receipt });
          return order;
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
  crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');

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
  const Order = require('../models/Order');

  await connectDB();
  await Enrolled.syncIndexes();
  await Order.syncIndexes();

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

  // ---- Courses (admin CRUD, incl. optional originalPrice) ----
  console.log('\n[0] Admin course management still works (incl. originalPrice)');
  const mk = (body) => request(app).post('/api/courses').set(auth(admin.token)).send(body);
  let r = await mk({ title: 'Course A', price: 1000 });
  check('admin create course A -> 201', r.status === 201);
  const A = r.body.data._id;
  r = await mk({ title: 'Course B', price: 2000, originalPrice: 2500 }); // real discount
  check('admin create course B with originalPrice -> 201', r.status === 201 && r.body.data.originalPrice === 2500);
  const B = r.body.data._id;
  r = await mk({ title: 'Free Course C', price: 0 });
  const C = r.body.data._id;
  r = await mk({ title: 'Course D', price: 500 });
  const D = r.body.data._id;
  r = await mk({ title: 'Bad Original', price: 100, originalPrice: -5 });
  check('negative originalPrice -> 400', r.status === 400);
  r = await request(app).put(`/api/courses/${D}`).set(auth(admin.token)).send({ originalPrice: 900 });
  check('admin update originalPrice -> 200', r.status === 200 && r.body.data.originalPrice === 900);

  // ---- Cart create-order: auth + validation ----
  console.log('\n[1] cart create-order auth + validation');
  r = await request(app).post('/api/payments/cart/create-order').send({ courseIds: [A, B] });
  check('unauthenticated cart checkout -> 401', r.status === 401);
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: [] });
  check('empty cart -> 400', r.status === 400);
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: ['bad'] });
  check('invalid course id -> 400', r.status === 400);
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: ['64b64c14b4a1e2a1c8f00000'] });
  check('nonexistent course -> 400', r.status === 400);
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: [C] });
  check('free-only cart -> 400 (nothing purchasable)', r.status === 400);

  // ---- Server-authoritative total, dedupe, discount, ONE order ----
  console.log('\n[2] server-calculated total, dedupe, discount, single Razorpay order');
  const before = createdOrders.length;
  // Duplicate A + free C + client-supplied bogus amounts — all must be ignored.
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({
    courseIds: [A, A, B, C],
    amount: 1, total: 1, price: 1, prices: { [A]: 1, [B]: 1 }, discount: 999999,
  });
  check('cart create-order -> 201', r.status === 201);
  const cart = r.body.data;
  check('duplicate + free excluded (2 purchasable items: A,B)', cart.items.length === 2);
  check('subtotal = 1000 + 2500 (list) = 350000 paise', cart.subtotal === 350000);
  check('discount = 2500-2000 = 50000 paise', cart.discount === 50000);
  check('total = 1000 + 2000 = 300000 paise (charged)', cart.total === 300000 && cart.amount === 300000);
  check('client-supplied amount/total/discount IGNORED', cart.amount === 300000 && cart.discount === 50000);
  check('currency INR', cart.currency === 'INR');
  check('returns TEST key id only', /^rzp_test_/.test(cart.key));
  check('exactly ONE Razorpay order created for the whole cart', createdOrders.length === before + 1);
  check('Razorpay order amount == server total (300000)', createdOrders[createdOrders.length - 1].amount === 300000);
  check('receipt <= 40 chars', createdOrders[createdOrders.length - 1].receipt.length <= 40);
  const cartOrderId = cart.orderId;
  const orderDoc = await Order.findOne({ orderId: cartOrderId });
  check('Order doc stored with status created + 2 items', orderDoc && orderDoc.status === 'created' && orderDoc.items.length === 2);
  check('Order totalAmount persisted = 300000', orderDoc.totalAmount === 300000);

  // ---- Verify: valid signature grants ALL courses ----
  console.log('\n[3] verify (valid) grants access to every course');
  r = await request(app).post('/api/payments/cart/verify').set(auth(studentA.token))
    .send({ orderId: cartOrderId, paymentId: 'pay_cart1', signature: sign(cartOrderId, 'pay_cart1') });
  check('cart verify valid -> 200', r.status === 200 && r.body.success === true);
  check('response lists both purchased courseIds', r.body.data.courseIds.length === 2);
  check('access granted to A', Boolean(await Enrolled.findOne({ userId: studentA.id, courseId: A })));
  check('access granted to B', Boolean(await Enrolled.findOne({ userId: studentA.id, courseId: B })));
  const paidOrder = await Order.findOne({ orderId: cartOrderId });
  check('order status -> paid, paymentId set', paidOrder.status === 'paid' && paidOrder.paymentId === 'pay_cart1');

  // ---- owned endpoint (authoritative) ----
  console.log('\n[4] owned endpoint reflects Enrolled (authoritative)');
  r = await request(app).get('/api/payments/owned').set(auth(studentA.token));
  check('owned -> 200 and includes A and B', r.status === 200 && r.body.courseIds.includes(String(A)) && r.body.courseIds.includes(String(B)));
  r = await request(app).get('/api/payments/owned');
  check('owned without token -> 401', r.status === 401);

  // ---- Already-owned handling in a new cart ----
  console.log('\n[5] already-owned excluded from a new cart');
  const before2 = createdOrders.length;
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: [A, B, D] });
  check('new cart with owned A,B + new D -> 201', r.status === 201);
  check('only D remains purchasable (1 item)', r.body.data.items.length === 1);
  check('total = D 500 -> 50000 paise (owned excluded)', r.body.data.total === 50000);
  check('another single Razorpay order created', createdOrders.length === before2 + 1);
  const allOwnedId = (await request(app).post('/api/payments/cart/create-order').set(auth(studentA.token)).send({ courseIds: [A, B] }));
  check('cart of only-owned courses -> 400', allOwnedId.status === 400);

  // ---- Idempotent verification + invalid signature ----
  console.log('\n[6] idempotency + tampered signature');
  // studentB buys D alone (cart of one).
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentB.token)).send({ courseIds: [D] });
  const bOrderId = r.body.data.orderId;
  r = await request(app).post('/api/payments/cart/verify').set(auth(studentB.token))
    .send({ orderId: bOrderId, paymentId: 'pay_b1', signature: 'deadbeef' });
  check('tampered signature -> 400', r.status === 400);
  check('tampered order marked failed', (await Order.findOne({ orderId: bOrderId })).status === 'failed');
  check('no access granted on failure', !(await Enrolled.findOne({ userId: studentB.id, courseId: D })));
  // Cross-user: studentA cannot verify studentB's order.
  r = await request(app).post('/api/payments/cart/verify').set(auth(studentA.token))
    .send({ orderId: bOrderId, paymentId: 'pay_b1', signature: sign(bOrderId, 'pay_b1') });
  check('cannot verify another user order -> 400', r.status === 400);
  // Fresh order for studentB, verify twice (idempotent).
  r = await request(app).post('/api/payments/cart/create-order').set(auth(studentB.token)).send({ courseIds: [D] });
  const bOrder2 = r.body.data.orderId;
  await request(app).post('/api/payments/cart/verify').set(auth(studentB.token))
    .send({ orderId: bOrder2, paymentId: 'pay_b2', signature: sign(bOrder2, 'pay_b2') });
  r = await request(app).post('/api/payments/cart/verify').set(auth(studentB.token))
    .send({ orderId: bOrder2, paymentId: 'pay_b2', signature: sign(bOrder2, 'pay_b2') });
  check('duplicate cart verify -> 200 (idempotent)', r.status === 200);
  check('no duplicate enrollment for D', (await Enrolled.countDocuments({ userId: studentB.id, courseId: D })) === 1);

  // ---- Single-course Buy Now regression (Phase 3 path untouched) ----
  console.log('\n[7] single-course Buy Now still works (Phase 3)');
  r = await request(app).post('/api/payments/create-order').set(auth(studentB.token)).send({ courseId: A });
  check('single create-order -> 201, amount 100000', r.status === 201 && r.body.data.amount === 100000);
  const singleOrder = r.body.data.orderId;
  r = await request(app).post('/api/payments/verify').set(auth(studentB.token))
    .send({ orderId: singleOrder, paymentId: 'pay_s1', signature: sign(singleOrder, 'pay_s1') });
  check('single verify -> 200 + enrolled in A', r.status === 200 && Boolean(await Enrolled.findOne({ userId: studentB.id, courseId: A })));

  // ---- Free / paid-gate behavior preserved ----
  console.log('\n[8] free-enroll works; paid-course free-enroll blocked');
  r = await request(app).post('/api/courses/enroll').set(auth(studentB.token)).send({ courseId: C });
  check('free course enroll -> 201', r.status === 201);
  r = await request(app).post('/api/courses/enroll').set(auth(studentA.token)).send({ courseId: D });
  check('paid course free-enroll -> 403', r.status === 403);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  await mongoose.disconnect();
  await mem.stop();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('TEST HARNESS ERROR:', e);
  process.exit(1);
});
