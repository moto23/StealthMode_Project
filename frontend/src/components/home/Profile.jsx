import React, { useContext, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { UserContext } from '../../context/UserContext';
import api from '../../services/api';
import { getProgressSummary } from '../../services/learn';
import { CardSkeletonGrid } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import '../css/Profile.css';

function Profile() {
  const { user } = useContext(UserContext);
  const [enrollments, setEnrollments] = useState([]);
  const [progress, setProgress] = useState({}); // { courseId: percent }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEnrolled = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/api/courses/enrolled/${user._id}`);
      setEnrollments(Array.isArray(response.data) ? response.data : []);
      // Progress summary is best-effort — never blocks the course list.
      getProgressSummary()
        .then((p) => setProgress(p || {}))
        .catch(() => {});
    } catch (err) {
      console.error('Error fetching enrolled courses:', err.response?.data || err.message);
      setError('We couldn’t load your courses. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEnrolled();
  }, [fetchEnrolled]);

  if (!user) {
    return (
      <div className="profile-page">
        <EmptyState
          icon="🔒"
          title="Please log in"
          message="Log in to view your profile and your courses."
          action={<Link to="/login" className="sm-btn sm-btn-primary">Log in</Link>}
        />
      </div>
    );
  }

  const initials = (user.fullName || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Populated enrollments may reference a since-deleted course (courseId null).
  const courses = enrollments
    .map((e) => e.courseId)
    .filter((c) => c && typeof c === 'object');

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div className="profile-avatar" aria-hidden="true">{initials}</div>
        <div>
          <h1 className="profile-name">{user.fullName}</h1>
          <p className="profile-email">{user.email}</p>
        </div>
      </header>

      <section className="profile-section">
        <h2 className="profile-section-title">My Learning</h2>

        {loading ? (
          <div className="profile-grid">
            <CardSkeletonGrid count={3} />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEnrolled} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon="📚"
            title="No courses yet"
            message="Explore the catalog and enroll to start learning."
            action={<Link to="/dashboard" className="sm-btn sm-btn-primary">Browse Courses</Link>}
          />
        ) : (
          <div className="profile-grid">
            {courses.map((course) => {
              const pct = progress[String(course._id)];
              return (
                <article key={course._id} className="learning-card">
                  <div className="learning-card-media">
                    <img src={course.imageUrl} alt={course.title} loading="lazy" />
                  </div>
                  <div className="learning-card-body">
                    <h3 className="learning-card-title">{course.title}</h3>
                    {course.instructor && (
                      <p className="learning-card-instructor">{course.instructor}</p>
                    )}
                    {typeof pct === 'number' && (
                      <div className="learning-card-progress">
                        <div className="learning-card-progress-bar">
                          <span style={{ width: `${pct}%` }} />
                        </div>
                        <span className="learning-card-progress-label">{pct}% complete</span>
                      </div>
                    )}
                    <Link to={`/learn/${course._id}`} className="sm-btn sm-btn-primary learning-card-cta">
                      {pct > 0 ? 'Continue Learning' : 'Start Learning'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Profile;
