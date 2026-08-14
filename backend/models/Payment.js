// backend/models/Payment.js
const mongoose = require('mongoose');

// Records the Razorpay order/payment lifecycle. Structured so a future
// webhook (payment.captured) can update the same document by orderId/paymentId
// without schema changes.
const paymentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    // Razorpay order id (server-created). Unique => idempotent verification.
    orderId: { type: String, required: true },
    // Set once payment is captured/verified.
    paymentId: { type: String, default: null },
    // Amount in the smallest currency unit (paise), taken from the DB course price.
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed'],
      default: 'created',
    },
  },
  {
    timestamps: true,
    // Indexes are created deliberately via scripts/ensureIndexes.js.
    autoIndex: false,
  }
);

// One payment record per Razorpay order (enforces idempotency at the DB level).
paymentSchema.index({ orderId: 1 }, { unique: true });
// Fast lookups for purchased-status checks.
paymentSchema.index({ userId: 1, courseId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
