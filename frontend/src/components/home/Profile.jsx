import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom'; // Import Link from react-router-dom
import { UserContext } from '../../context/UserContext';
import axios from 'axios';
import '../css/Profile.css';

function Profile() {
  const { user } = useContext(UserContext);
  const [enrolledCourses, setEnrolledCourses] = useState([]);

  useEffect(() => {
    const fetchEnrolledCourses = async () => {
      try {
        if (user) {
          const response = await axios.get(`https://sleath-backend.vercel.app/api/courses/enrolled/${user._id}`);
          console.log('Fetched Enrolled Courses:', response.data); // Add this line to log the fetched courses
          setEnrolledCourses(response.data);
        }
      } catch (error) {
        console.error('Error fetching enrolled courses:', error);
      }
    };

    fetchEnrolledCourses();
  }, [user]);

  if (!user) {
    return <p>Please log in to view your profile.</p>;
  }

  return (
    <div className="profile-container">
      <h1>Profile</h1>
      <div className="profile-details">
        <p><strong>Full Name:</strong> {user.fullName}</p>
        <p><strong>Email:</strong> {user.email}</p>
      </div>
      <h2>Enrolled Courses:</h2>
      <ul className="course-list">
        {enrolledCourses.length === 0 ? (
          <p>No courses enrolled yet.</p>
        ) : (
          enrolledCourses.map((enrollment, index) => (
            <li key={index}>
              <Link to={`/enroll/${enrollment.courseId._id}`}>{enrollment.courseId.title}</Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export default Profile;
