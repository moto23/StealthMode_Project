const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Enrolled = require('../models/Enrolled');
const User = require('../models/User');



router.get('/', async (req, res) => {
  try {
    const courses = await Course.find();
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/enrolled/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const enrollments = await Enrolled.find({ userId }).populate('courseId');
    console.log('Enrollments:', enrollments); // Add this line to log enrollments
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.post('/enroll', async (req, res) => {
  const { userId, courseId } = req.body;

  try {
    const user = await User.findById(userId);
    const course = await Course.findById(courseId);

    if (!user || !course) {
      return res.status(404).json({ message: 'User or Course not found' });
    }

    const existingEnrollment = await Enrolled.findOne({ userId, courseId });
    if (existingEnrollment) {
      return res.status(400).json({ message: 'Already enrolled in this course' });
    }

    const enrollment = new Enrolled({
      userId: user._id,
      courseId: course._id,
      userFullName: user.fullName,
      courseTitle: course.title,
    });

    await enrollment.save();

    res.status(201).json({ message: 'Enrolled successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.get('/enrolled/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const enrollments = await Enrolled.find({ userId });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



router.get('/:id', async (req, res) => {
  try {
    const courseId = req.params.id.trim(); // Ensure the ID is trimmed
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }
    res.json(course);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
