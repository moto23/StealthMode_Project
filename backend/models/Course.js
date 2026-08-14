const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  // Stable, unique identifier used for idempotent seeding (upsert key).
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: String,
  registrationDate: Date,
  category: String,
  // Course metadata for a professional catalog (consumed by the UI).
  level: String,        // Beginner | Intermediate | Advanced
  duration: String,     // e.g. "42 hours"
  instructor: String,
  price: Number,        // INR; the authoritative selling price (charged)
  // Optional compare-at ("was") price for a legitimate discount. When present
  // AND greater than `price`, the UI shows a discount computed dynamically.
  // Never populated with fake data; `price` remains authoritative.
  originalPrice: Number,
  imageUrl: String,     // card thumbnail
  featureImage: String, // detail-page feature banner (read by Enroll)
  label: String,
  features: [
    {
      title: String,
      description: String,
    },
  ],
});

module.exports = mongoose.model('Course', courseSchema);
