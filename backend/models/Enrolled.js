// backend/models/Enrolled.js
const mongoose = require('mongoose');

const enrolledSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  userFullName: String,
  courseTitle: String,
});

module.exports = mongoose.model('Enrolled', enrolledSchema);
