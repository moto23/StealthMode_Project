import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import CourseForm from './CourseForm';
import { getManagedCourses, publishCourse, unpublishCourse } from '../../services/adminVideo';
import '../css/Admin.css';

function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // course being edited, or null for create
  const [deletingId, setDeletingId] = useState(null);
  const [publishingId, setPublishingId] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // course pending delete confirmation
  const cancelRef = useRef(null);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Admin management list — includes drafts (the public catalog does not).
      const data = await getManagedCourses();
      setCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, []);

  // Publish a draft (validated server-side) or return a published course to draft.
  const togglePublish = async (course) => {
    setActionError('');
    setPublishingId(course._id);
    try {
      if (course.status === 'draft') {
        await publishCourse(course._id);
      } else {
        await unpublishCourse(course._id);
      }
      await loadCourses();
    } catch (err) {
      const issues = err.response?.data?.issues;
      setActionError(
        issues && issues.length
          ? `Can’t publish “${course.title}”: ${issues.join(' ')}`
          : err.response?.data?.error || 'Failed to update publish status'
      );
    } finally {
      setPublishingId(null);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  // When the delete-confirmation modal opens, focus the safe (Cancel) button so
  // a reflexive Enter/Space does NOT trigger the destructive action.
  useEffect(() => {
    if (confirmTarget && cancelRef.current) {
      cancelRef.current.focus();
    }
  }, [confirmTarget]);

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

  // Step 1: request deletion — opens an explicit confirmation modal (no native confirm).
  const requestDelete = (course) => {
    setActionError('');
    setConfirmTarget(course);
  };

  const cancelDelete = () => setConfirmTarget(null);

  // Step 2: perform deletion only on an explicit click of the destructive button.
  const confirmDelete = async () => {
    if (!confirmTarget) return;
    const course = confirmTarget;
    setActionError('');
    setDeletingId(course._id);
    try {
      await api.delete(`/api/courses/${course._id}`);
      setConfirmTarget(null);
      await loadCourses();
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to delete course');
      setConfirmTarget(null);
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
                <th>Status</th>
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
                  <td>
                    <span className={`admin-status-badge ${course.status === 'draft' ? 'draft' : 'published'}`}>
                      {course.status === 'draft' ? 'Draft' : 'Published'}
                    </span>
                  </td>
                  <td className="admin-actions-col">
                    <div className="admin-row-actions">
                      <button
                        className="admin-btn admin-btn-small"
                        onClick={() => togglePublish(course)}
                        disabled={publishingId === course._id}
                      >
                        {publishingId === course._id
                          ? '…'
                          : course.status === 'draft'
                          ? 'Publish'
                          : 'Unpublish'}
                      </button>
                      <button className="admin-btn admin-btn-small" onClick={() => openEdit(course)}>
                        Edit
                      </button>
                      <span className="admin-actions-divider" aria-hidden="true" />
                      <button
                        className="admin-btn admin-btn-danger admin-btn-small admin-btn-delete"
                        onClick={() => requestDelete(course)}
                        disabled={deletingId === course._id}
                      >
                        {deletingId === course._id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
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

      {confirmTarget && (
        <div
          className="admin-modal-overlay"
          onClick={cancelDelete}
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-delete-title"
        >
          <div
            className="admin-modal admin-modal-confirm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <h3 id="admin-delete-title">Delete course</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={cancelDelete}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="admin-modal-body">
              <p>You are about to permanently delete:</p>
              <p className="admin-confirm-course">“{confirmTarget.title}”</p>
              <p className="admin-confirm-warning">This action cannot be undone.</p>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={cancelDelete}
                ref={cancelRef}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={confirmDelete}
                disabled={deletingId === confirmTarget._id}
              >
                {deletingId === confirmTarget._id ? 'Deleting…' : 'Yes, Delete Course'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCourses;
