import React, { useEffect, useState, useContext, useCallback } from 'react';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import CourseCard from './CourseCard';
import '../css/Dashboard.css';

function Dashboard() {
  const { user } = useContext(UserContext);
  const [courses, setCourses] = useState([]);
  const [owned, setOwned] = useState(() => new Set());

  useEffect(() => {
    let active = true;
    const fetchCourses = async () => {
      try {
        const response = await api.get('/api/courses');
        if (active) setCourses(response.data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchCourses();
    return () => {
      active = false;
    };
  }, []);

  // Authoritative ownership from the backend (never localStorage).
  useEffect(() => {
    let active = true;
    if (!user) {
      setOwned(new Set());
      return undefined;
    }
    api
      .get('/api/payments/owned')
      .then((res) => {
        if (active) setOwned(new Set((res.data.courseIds || []).map(String)));
      })
      .catch(() => {
        /* non-fatal: cards simply won't show Purchased */
      });
    return () => {
      active = false;
    };
  }, [user]);

  const markOwned = useCallback((courseId) => {
    setOwned((prev) => new Set(prev).add(String(courseId)));
  }, []);

  return (
    <div className="storefront">
      <header className="storefront-hero">
        <h1>Explore Courses</h1>
        <p>Level up with industry-focused, project-based programs.</p>
      </header>
      <div className="course-list">
        {courses.map((course) => (
          <CourseCard
            key={course._id}
            course={course}
            owned={owned.has(String(course._id))}
            onPurchased={markOwned}
          />
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
