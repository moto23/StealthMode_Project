// backend/models/Order.js
const mongoose = require('mongoose');

// A multi-course cart checkout order. Separate from the Phase 3 single-course
// `Payment` collection so the existing single-course flow is untouched. One
// Razorpay order (unique `orderId`) can cover many courses via `items`.
// Structured so a future webhook (payment.captured) can update by orderId.
const orderItemSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    // Snapshot of the title at purchase time (courses can be renamed/deleted).
    titleSnapshot: { type: String, default: '' },
    // Charged amount for this item, in paise (from the DB price, server-side).
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Razorpay order id (server-created). Unique => idempotent verification.
    orderId: { type: String, required: true },
    paymentId: { type: String, default: null },
    items: { type: [orderItemSchema], required: true },
    // All monetary values in paise (smallest currency unit).
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
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

// One order per Razorpay order id (enforces idempotency at the DB level).
orderSchema.index({ orderId: 1 }, { unique: true });
// Fast lookups for a user's order history.
orderSchema.index({ userId: 1 });

module.exports = mongoose.model('Order', orderSchema);
