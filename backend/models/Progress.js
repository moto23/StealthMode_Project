const mongoose = require('mongoose');

// Per-user, per-course learning progress (Phase 7, Slice 2).
// One document per (userId, courseId). Lesson completions are stored as a
// de-duplicated set of lesson ids — combined with the unique (userId, courseId)
// index this gives the (userId, courseId, lessonId) uniqueness protection:
// a lesson can never be recorded as complete more than once ($addToSet).
// The completion PERCENTAGE is always computed server-side from these ids
// against the course's real lessons — client-supplied percentages are ignored.
const progressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    completedLessonIds: [{ type: mongoose.Schema.Types.ObjectId }],
    currentLessonId: { type: mongoose.Schema.Types.ObjectId }, // resume point
  },
  {
    timestamps: true,
    // Indexes are created deliberately (ensureIndexes / syncIndexes), not on
    // every serverless boot — matching the rest of the models.
    autoIndex: false,
  }
);

progressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Progress', progressSchema);
