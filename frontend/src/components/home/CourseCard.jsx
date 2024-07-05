import React from 'react';
import { Link } from 'react-router-dom';


function CourseCard({ course }) {
  return (
    <div className="course-card">
      <img src={course.imageUrl} alt={course.title} />
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="registration-date-container">
        <span className="registration-date-label">Registration Date:</span>
        <span className="registration-date">{new Date(course.registrationDate).toLocaleDateString()}</span>
      </div>
      <Link to={`/enroll/${course._id.trim()}`}><button>Explore</button></Link>
    </div>
  );
}

export default CourseCard;

