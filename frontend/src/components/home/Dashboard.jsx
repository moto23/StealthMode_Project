import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import CourseCard from './CourseCard';
import '../css/Dashboard.css';

function Dashboard() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await api.get('/api/courses');
        setCourses(response.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchCourses();
  }, []);

  return (
    <div>
      <h1>Featured Courses</h1>
      <div className="course-list">
        {courses.map(course => (
          <CourseCard key={course._id} course={course} />
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
