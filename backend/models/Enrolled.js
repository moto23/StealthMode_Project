// backend/models/Enrolled.js
const mongoose = require('mongoose');

const enrolledSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    userFullName: String,
    courseTitle: String,
  },
  {
    timestamps: true,
    // Index creation is done deliberately via scripts/ensureIndexes.js
    // (after a duplicate check), not automatically on every serverless boot.
    autoIndex: false,
  }
);

// Enforce one enrollment per (user, course) at the database level.
enrolledSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Enrolled', enrolledSchema);
