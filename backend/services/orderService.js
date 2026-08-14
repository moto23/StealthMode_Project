const Course = require('../models/Course');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { isValidObjectId } = require('../utils/validate');
const enrollmentService = require('./enrollmentService');
const paymentService = require('./paymentService');

// Compute the authoritative pricing for one course, in paise.
//  - sell  = price (what we charge)
//  - list  = originalPrice when it is a real, higher compare-at price, else price
// The browser never supplies any of these; everything comes from the DB.
const priceParts = (course) => {
  const sell = Math.round((Number(course.price) || 0) * 100);
  const hasCompareAt =
    course.originalPrice != null && Number(course.originalPrice) > Number(course.price);
  const list = hasCompareAt ? Math.round(Number(course.originalPrice) * 100) : sell;
  return { sell, list };
};

// Create ONE Razorpay order for the whole cart. Amount is derived exclusively
// from MongoDB course prices; any client-supplied prices/totals are ignored.
const createCartOrder = async (userId, courseIds) => {
  paymentService.requireConfig();

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    throw ApiError.badRequest('courseIds must be a non-empty array');
  }

  // De-duplicate and validate every id up front.
  const uniqueIds = [...new Set(courseIds.map((id) => String(id)))];
  if (uniqueIds.some((id) => !isValidObjectId(id))) {
    throw ApiError.badRequest('One or more course ids are invalid');
  }

  // Every requested course must exist.
  const courses = await Course.find({ _id: { $in: uniqueIds } });
  if (courses.length !== uniqueIds.length) {
    throw ApiError.badRequest('One or more courses were not found');
  }

  // Exclude courses the user already owns (authoritative: Enrolled) and any
  // free courses (those go through the free-enrollment flow, not paid checkout).
  const ownedSet = new Set(await enrollmentService.listOwnedCourseIds(userId));
  const purchasable = courses.filter(
    (c) => Number(c.price) > 0 && !ownedSet.has(String(c._id))
  );

  if (purchasable.length === 0) {
    throw ApiError.badRequest(
      'No purchasable courses in cart (already owned or free)'
    );
  }

  let subtotal = 0; // sum of list (compare-at) prices, paise
  let total = 0; // sum of sell prices, paise (charged)
  const items = purchasable.map((c) => {
    const { sell, list } = priceParts(c);
    subtotal += list;
    total += sell;
    return { courseId: c._id, titleSnapshot: c.title || '', amount: sell };
  });
  const discount = Math.max(0, subtotal - total);

  const order = await paymentService.getClient().orders.create({
    amount: total, // paise, server-calculated
    currency: 'INR',
    receipt: paymentService.buildReceipt(),
    notes: { userId: String(userId), courseCount: String(items.length) },
  });

  await Order.create({
    userId,
    orderId: order.id,
    items,
    subtotal,
    discount,
    totalAmount: total,
    currency: 'INR',
    status: 'created',
  });

  return {
    orderId: order.id,
    amount: total, // paise — the authoritative amount Razorpay will charge
    currency: 'INR',
    key: process.env.RAZORPAY_KEY_ID, // public key id only; never the secret
    subtotal,
    discount,
    total,
    items: purchasable.map((c) => {
      const { sell, list } = priceParts(c);
      return {
        courseId: String(c._id),
        title: c.title,
        instructor: c.instructor || '',
        imageUrl: c.imageUrl || '',
        price: Number(c.price) || 0,
        originalPrice:
          c.originalPrice != null && Number(c.originalPrice) > Number(c.price)
            ? Number(c.originalPrice)
            : null,
        amount: sell,
        listAmount: list,
      };
    }),
  };
};

// Verify a cart payment server-side (HMAC-SHA256, timing-safe) using the server
// order id, then grant access to EVERY item. Idempotent.
const verifyCartOrder = async (userId, { orderId, paymentId, signature } = {}) => {
  paymentService.requireConfig();

  if (!orderId || !paymentId || !signature) {
    throw ApiError.badRequest('orderId, paymentId and signature are required');
  }

  // Look up the order for THIS user (prevents verifying someone else's order).
  const order = await Order.findOne({ orderId, userId });
  if (!order) throw ApiError.badRequest('Order not found');

  // Idempotent: already processed -> ensure access and return.
  if (order.status === 'paid') {
    await grantAll(userId, order);
    return { order, alreadyProcessed: true };
  }

  if (!paymentService.verifySignature(orderId, paymentId, signature)) {
    order.status = 'failed';
    await order.save();
    throw ApiError.badRequest('Payment signature verification failed');
  }

  order.status = 'paid';
  order.paymentId = paymentId;
  await order.save();

  await grantAll(userId, order);
  return { order, alreadyProcessed: false };
};

// Grant access to every course in the order. Idempotent per course.
const grantAll = async (userId, order) => {
  for (const item of order.items) {
    // Sequential keeps the (userId, courseId) unique-index races simple.
    // eslint-disable-next-line no-await-in-loop
    await enrollmentService.grantAccess(userId, item.courseId);
  }
};

// Ownership set for the authenticated user (source of truth: Enrolled).
const getOwned = async (userId) => {
  const courseIds = await enrollmentService.listOwnedCourseIds(userId);
  return { courseIds };
};

module.exports = { createCartOrder, verifyCartOrder, getOwned };
