import React, { useState } from 'react';
import api from '../../services/api';

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  category: '',
  level: '',
  duration: '',
  instructor: '',
  price: '',
  imageUrl: '',
  featureImage: '',
  label: '',
};

// Reusable create/edit modal. `course` null => create, object => edit.
function CourseForm({ course, onClose, onSaved }) {
  const isEdit = Boolean(course && course._id);

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    ...(course
      ? {
          title: course.title || '',
          slug: course.slug || '',
          description: course.description || '',
          category: course.category || '',
          level: course.level || '',
          duration: course.duration || '',
          instructor: course.instructor || '',
          price: course.price != null ? String(course.price) : '',
          imageUrl: course.imageUrl || '',
          featureImage: course.featureImage || '',
          label: course.label || '',
        }
      : {}),
  }));

  const [features, setFeatures] = useState(
    course && Array.isArray(course.features) && course.features.length
      ? course.features.map((f) => ({ title: f.title || '', description: f.description || '' }))
      : []
  );

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const updateFeature = (index, field, value) => {
    setFeatures((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  const addFeature = () => setFeatures((prev) => [...prev, { title: '', description: '' }]);
  const removeFeature = (index) => setFeatures((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (form.price !== '' && (Number.isNaN(Number(form.price)) || Number(form.price) < 0)) {
      setError('Price must be a non-negative number');
      return;
    }

    // Build the payload from non-empty fields only.
    const payload = {};
    Object.keys(emptyForm).forEach((key) => {
      const val = form[key];
      if (val !== '' && val != null) payload[key] = val;
    });
    if (form.price !== '') payload.price = Number(form.price);
    const cleanFeatures = features.filter((f) => f.title.trim() || f.description.trim());
    if (cleanFeatures.length) payload.features = cleanFeatures;

    setSubmitting(true);
    setError('');
    try {
      const response = isEdit
        ? await api.put(`/api/courses/${course._id}`, payload)
        : await api.post('/api/courses', payload);
      onSaved(response.data.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save course');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{isEdit ? 'Edit Course' : 'Create Course'}</h3>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="admin-form">
          <div className="admin-form-grid">
            <label className="admin-field">
              <span>Title *</span>
              <input name="title" value={form.title} onChange={handleChange} required />
            </label>
            <label className="admin-field">
              <span>Slug (auto-generated if blank)</span>
              <input name="slug" value={form.slug} onChange={handleChange} placeholder="auto-generated" />
            </label>
            <label className="admin-field">
              <span>Category</span>
              <input name="category" value={form.category} onChange={handleChange} />
            </label>
            <label className="admin-field">
              <span>Level</span>
              <select name="level" value={form.level} onChange={handleChange}>
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Duration</span>
              <input name="duration" value={form.duration} onChange={handleChange} placeholder="e.g. 40 hours" />
            </label>
            <label className="admin-field">
              <span>Instructor</span>
              <input name="instructor" value={form.instructor} onChange={handleChange} />
            </label>
            <label className="admin-field">
              <span>Price (INR)</span>
              <input name="price" type="number" min="0" value={form.price} onChange={handleChange} />
            </label>
            <label className="admin-field">
              <span>Label</span>
              <input name="label" value={form.label} onChange={handleChange} placeholder="e.g. Bestseller" />
            </label>
            <label className="admin-field admin-field-wide">
              <span>Image URL</span>
              <input name="imageUrl" value={form.imageUrl} onChange={handleChange} />
            </label>
            <label className="admin-field admin-field-wide">
              <span>Feature Image URL</span>
              <input name="featureImage" value={form.featureImage} onChange={handleChange} />
            </label>
            <label className="admin-field admin-field-wide">
              <span>Description</span>
              <textarea name="description" rows={3} value={form.description} onChange={handleChange} />
            </label>
          </div>

          <div className="admin-features">
            <div className="admin-features-header">
              <span>Features</span>
              <button type="button" className="admin-btn admin-btn-small" onClick={addFeature}>
                + Add feature
              </button>
            </div>
            {features.length === 0 && <p className="admin-muted">No features added.</p>}
            {features.map((f, i) => (
              <div key={i} className="admin-feature-row">
                <input
                  placeholder="Feature title"
                  value={f.title}
                  onChange={(e) => updateFeature(i, 'title', e.target.value)}
                />
                <input
                  placeholder="Feature description"
                  value={f.description}
                  onChange={(e) => updateFeature(i, 'description', e.target.value)}
                />
                <button
                  type="button"
                  className="admin-btn admin-btn-danger admin-btn-small"
                  onClick={() => removeFeature(i)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {error && <p className="admin-error">{error}</p>}

          <div className="admin-modal-actions">
            <button type="button" className="admin-btn admin-btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CourseForm;
