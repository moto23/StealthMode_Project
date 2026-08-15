const mongoose = require('mongoose');

// Course review + rating (Phase 7, Slice 3). One review per (userId, courseId),
// enforced by the unique compound index — so "create" is really an upsert and a
// user can edit their single review. Average/count are always computed from the
// real stored reviews; never fabricated.
const reviewSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userFullName: String, // denormalized for display
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', trim: true },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

reviewSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);
