const crypto = require('crypto');
const Razorpay = require('razorpay');

const Payment = require('../models/Payment');
const Course = require('../models/Course');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');
const enrollmentService = require('./enrollmentService');

const isConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const requireConfig = () => {
  if (!isConfigured()) {
    throw new ApiError(503, 'Payment service is not configured');
  }
};

const getClient = () => {
  requireConfig();
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

// Create a Razorpay order. The amount is ALWAYS derived from the DB course
// price (never from the client). Returns only the public key id to the client.
const createOrder = async (userId, courseId) => {
  requireConfig();
  assertValidObjectId(courseId, 'course id');

  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const price = Number(course.price) || 0;
  if (price <= 0) {
    throw ApiError.badRequest('This course is free; no payment required');
  }

  const amountPaise = Math.round(price * 100); // INR -> paise (server-authoritative)

  // Razorpay caps `receipt` at 40 chars. Keep it compact & unique; the full
  // userId/courseId live on the Payment record and in `notes` below.
  const receipt = `rcpt_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;

  const order = await getClient().orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes: { userId: String(userId), courseId: String(courseId) },
  });

  await Payment.create({
    userId,
    courseId,
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    status: 'created',
  });

  // key id is public and required by the checkout widget; secret is never sent.
  return {
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    key: process.env.RAZORPAY_KEY_ID,
    courseId: String(courseId),
  };
};

// Verify a Razorpay payment signature server-side (HMAC-SHA256, timing-safe),
// using the server/DB order id, then grant access. Idempotent.
const verifyPayment = async (userId, { orderId, paymentId, signature }) => {
  requireConfig();

  if (!orderId || !paymentId || !signature) {
    throw ApiError.badRequest('orderId, paymentId and signature are required');
  }

  // Look up the order for THIS user (prevents verifying someone else's order).
  const payment = await Payment.findOne({ orderId, userId });
  if (!payment) throw ApiError.badRequest('Order not found');

  // Idempotent: already processed -> ensure access and return.
  if (payment.status === 'paid') {
    await enrollmentService.grantAccess(userId, payment.courseId);
    return { payment, alreadyProcessed: true };
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(String(signature), 'utf8');
  const valid =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!valid) {
    payment.status = 'failed';
    await payment.save();
    throw ApiError.badRequest('Payment signature verification failed');
  }

  payment.status = 'paid';
  payment.paymentId = paymentId;
  await payment.save();

  await enrollmentService.grantAccess(userId, payment.courseId);
  return { payment, alreadyProcessed: false };
};

// Purchased status for the AUTHENTICATED user only (userId from JWT).
const getStatus = async (userId, courseId) => {
  assertValidObjectId(courseId, 'course id');
  const paid = await Payment.exists({ userId, courseId, status: 'paid' });
  return { purchased: Boolean(paid) };
};

module.exports = { createOrder, verifyPayment, getStatus, isConfigured };
