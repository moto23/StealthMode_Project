const mongoose = require('mongoose');

// ---- Curriculum (Phase 7, Slice 1) ----
// A lesson stores VIDEO METADATA ONLY — never a binary. `video.playbackId`/
// `assetId` are provider handles (e.g. Mux, wired in a later slice) and are
// treated as PROTECTED: public course reads strip them for non-preview lessons
// (see courseService.toPublicCourse). Subdocuments get a stable `_id`.
const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  duration: String, // display string, e.g. "8:24" or "12 min"
  isPreview: { type: Boolean, default: false }, // free preview → playable pre-purchase
  video: {
    provider: String,   // e.g. 'mux' (populated in a later slice)
    assetId: String,    // protected
    playbackId: String, // protected
  },
});

const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  lessons: [lessonSchema],
});

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
  // Ordered curriculum. Additive & backward-compatible (existing courses have
  // an empty array). Video metadata only — no binaries stored in MongoDB.
  sections: { type: [sectionSchema], default: [] },
});

module.exports = mongoose.model('Course', courseSchema);
