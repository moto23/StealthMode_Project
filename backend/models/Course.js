const mongoose = require('mongoose');

// ---- Caption / transcript track (Phase 8) ----
// One generated (or uploaded) text track on a Mux asset. `trackId` is the Mux
// track handle. Status mirrors Mux ('preparing' | 'ready' | 'errored').
const captionTrackSchema = new mongoose.Schema(
  {
    trackId: String,
    languageCode: String, // e.g. 'en'
    name: String,         // e.g. 'English'
    status: String,       // 'preparing' | 'ready' | 'errored'
  },
  { _id: false }
);

// ---- Curriculum (Phase 7, Slice 1; extended Phase 8) ----
// A lesson stores VIDEO METADATA ONLY — never a binary. `video.playbackId`/
// `assetId`/`uploadId` are Mux handles and are treated as PROTECTED: public
// course reads strip them (fully for protected lessons; preview lessons keep
// only the playbackId — see courseService.toPublicCourse). Subdocuments get a
// stable `_id`. All video fields are optional → backward compatible with Slice 1.
const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  duration: String, // display string, e.g. "8:24" or "12 min"
  isPreview: { type: Boolean, default: false }, // free preview → playable pre-purchase
  // Phase 8.5 (auto-seeding): mark auto-generated lessons so admins can review
  // and so regeneration is idempotent (matched by `autoKey`). Manual lessons
  // have `generated` unset and are preserved across regeneration.
  description: String,
  generated: Boolean,
  autoKey: String,
  video: {
    // provider: 'mux' for protected Mux playback; an external provider name
    // (e.g. 'youtube') for a LEGALLY EMBEDDABLE third-party embed (never
    // rehosted). The two are mutually exclusive per lesson.
    provider: String,
    // --- Mux (protected) ---
    assetId: String,         // PROTECTED — Mux asset id, server-side only
    playbackId: String,      // Mux (signed) playback id
    uploadId: String,        // PROTECTED — Mux direct-upload id (status polling)
    status: String,          // 'preparing' | 'ready' | 'errored'
    policy: String,          // 'signed' (default for new uploads) | 'public'
    // --- External embeddable source (Phase 8.5) ---
    sourceId: String,        // provider video id (e.g. YouTube videoId)
    url: String,             // canonical source URL
    embedUrl: String,        // official iframe embed URL (no rehosting)
    embeddable: Boolean,     // verified embeddable by the provider
    license: String,         // e.g. 'creativeCommon' | 'youtube'
    sourceTitle: String,     // real title from the provider (never invented)
    // --- Shared ---
    duration: Number,        // seconds, from the provider/Mux (optional)
    captions: { type: [captionTrackSchema], default: undefined },
  },
});

const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  // Phase 8.5: stable key for idempotent regeneration + auto-generated marker.
  autoKey: String,
  generated: Boolean,
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
  // Publishing state (Phase 8). Intentionally has NO schema default so that
  // pre-existing courses (which lack the field) read back as `undefined` and
  // stay visible in the public catalog. New courses are set to 'draft' by
  // courseService.createCourse; the public catalog hides only status === 'draft'.
  status: { type: String, enum: ['draft', 'published'] },
});

module.exports = mongoose.model('Course', courseSchema);
