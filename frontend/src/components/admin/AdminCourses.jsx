import React, { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import CourseForm from './CourseForm';
import '../css/Admin.css';

function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // course being edited, or null for create
  const [deletingId, setDeletingId] = useState(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/courses');
      setCourses(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const openCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (course) => {
    setEditing(course);
    setShowForm(true);
  };

  const handleSaved = () => {
    // Refresh from the server so the list reflects backend state (slug, etc.).
    loadCourses();
  };

  const handleDelete = async (course) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${course.title}"? This cannot be undone.`)) return;
    setActionError('');
    setDeletingId(course._id);
    try {
      await api.delete(`/api/courses/${course._id}`);
      await loadCourses();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to delete course');
    } finally {
      setDeletingId(null);
    }
  };

  const formatPrice = (p) => (p != null && p !== '' ? `₹${p}` : '—');

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1>Course Management</h1>
          <p className="admin-subtitle">Create, edit, and remove courses.</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openCreate}>
          + Create Course
        </button>
      </div>

      {actionError && <p className="admin-error">{actionError}</p>}

      {loading ? (
        <p className="admin-muted">Loading courses…</p>
      ) : error ? (
        <div className="admin-error-block">
          <p className="admin-error">{error}</p>
          <button className="admin-btn admin-btn-ghost" onClick={loadCourses}>
            Retry
          </button>
        </div>
      ) : courses.length === 0 ? (
        <p className="admin-muted">No courses yet. Create the first one.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Level</th>
                <th>Instructor</th>
                <th>Price</th>
                <th className="admin-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course._id}>
                  <td>{course.title}</td>
                  <td>{course.category || '—'}</td>
                  <td>{course.level || '—'}</td>
                  <td>{course.instructor || '—'}</td>
                  <td>{formatPrice(course.price)}</td>
                  <td className="admin-actions-col">
                    <button className="admin-btn admin-btn-small" onClick={() => openEdit(course)}>
                      Edit
                    </button>
                    <button
                      className="admin-btn admin-btn-danger admin-btn-small"
                      onClick={() => handleDelete(course)}
                      disabled={deletingId === course._id}
                    >
                      {deletingId === course._id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CourseForm course={editing} onClose={() => setShowForm(false)} onSaved={handleSaved} />
      )}
    </div>
  );
}

export default AdminCourses;
