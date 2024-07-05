const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Course = require('../models/Course');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const loadCourses = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/courses.json'), 'utf-8'));
    await Course.insertMany(data);

    console.log('Courses loaded successfully');
    mongoose.disconnect();
  } catch (error) {
    console.error('Error loading courses:', error);
  }
};

loadCourses();
