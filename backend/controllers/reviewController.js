const reviewService = require('../services/reviewService');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/courses/:id/reviews  (public) — list + average + count
exports.list = asyncHandler(async (req, res) => {
  const data = await reviewService.listReviews(req.params.id);
  res.json({ success: true, ...data });
});

// GET /api/courses/:id/reviews/me  (protected) — caller's own review or null
exports.mine = asyncHandler(async (req, res) => {
  const data = await reviewService.getMyReview(req.user.id, req.params.id);
  res.json({ success: true, ...data });
});

// POST /api/courses/:id/reviews  (protected; enrolled only) — create/edit own
exports.upsert = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const data = await reviewService.upsertReview(req.user.id, req.params.id, { rating, comment });
  res.status(201).json({ success: true, ...data });
});

// DELETE /api/courses/:id/reviews/me  (protected) — delete own review only
exports.remove = asyncHandler(async (req, res) => {
  const data = await reviewService.deleteReview(req.user.id, req.params.id);
  res.json({ success: true, ...data });
});
