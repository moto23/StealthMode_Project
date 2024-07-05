const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  description: String,
  registrationDate: Date,
  category: String,
  imageUrl: String,
  label: String,
  features: [{
    title: String,
    description: String
  }]
});

module.exports = mongoose.model('Course', courseSchema);
