const paymentService = require('../services/paymentService');
const orderService = require('../services/orderService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

// POST /api/payments/create-order  (protected)
// Body: { courseId }. Amount is derived server-side from the DB price.
exports.createOrder = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) throw ApiError.badRequest('courseId is required');
  const data = await paymentService.createOrder(req.user.id, courseId);
  res.status(201).json({ success: true, data });
});

// POST /api/payments/verify  (protected)
// Body: { orderId, paymentId, signature }.
exports.verify = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyPayment(req.user.id, req.body);
  res.json({
    success: true,
    message: result.alreadyProcessed ? 'Payment already verified' : 'Payment verified',
    data: { purchased: true, courseId: String(result.payment.courseId) },
  });
});

// GET /api/payments/status/:courseId  (protected) — caller's own status only
exports.status = asyncHandler(async (req, res) => {
  const data = await paymentService.getStatus(req.user.id, req.params.courseId);
  res.json({ success: true, ...data });
});

// POST /api/payments/cart/create-order  (protected)
// Body: { courseIds: [] }. Creates ONE Razorpay order for the whole cart;
// the total is computed server-side from DB prices (client amounts ignored).
exports.cartCreateOrder = asyncHandler(async (req, res) => {
  const { courseIds } = req.body;
  const data = await orderService.createCartOrder(req.user.id, courseIds);
  res.status(201).json({ success: true, data });
});

// POST /api/payments/cart/verify  (protected)
// Body: { orderId, paymentId, signature }. Grants access to every course.
exports.cartVerify = asyncHandler(async (req, res) => {
  const result = await orderService.verifyCartOrder(req.user.id, req.body);
  res.json({
    success: true,
    message: result.alreadyProcessed ? 'Payment already verified' : 'Payment verified',
    data: {
      purchased: true,
      courseIds: result.order.items.map((i) => String(i.courseId)),
    },
  });
});

// GET /api/payments/owned  (protected) — authoritative ownership for the caller
exports.owned = asyncHandler(async (req, res) => {
  const data = await orderService.getOwned(req.user.id);
  res.json({ success: true, ...data });
});
