import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import LessonVideoManager from './LessonVideoManager';
import { autoGenerateCourse } from '../../services/adminSeeding';

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

const emptyLesson = () => ({
  title: '',
  duration: '',
  isPreview: false,
  video: null,
});
const emptySection = () => ({ title: '', lessons: [] });

// Move item at index by delta within an array (immutably); no-op at bounds.
const move = (arr, index, delta) => {
  const next = index + delta;
  if (next < 0 || next >= arr.length) return arr;
  const copy = [...arr];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
};

const emptyForm = {
  title: '',
  slug: '',
  description: '',
  category: '',
  level: '',
  duration: '',
  instructor: '',
  price: '',
  originalPrice: '',
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
          originalPrice: course.originalPrice != null ? String(course.originalPrice) : '',
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

  // ---- Curriculum (Phase 7, Slice 1) ----
  // Loaded separately (admin endpoint returns full video handles) and saved via
  // its own endpoint so the existing course create/edit payload is unchanged.
  const [sections, setSections] = useState([]);
  const [curriculumMsg, setCurriculumMsg] = useState('');
  const [savingCurriculum, setSavingCurriculum] = useState(false);

  // ---- Auto content seeding (Phase 8.5) ----
  const [generating, setGenerating] = useState(false);
  const [seedReport, setSeedReport] = useState(null);
  const [seedError, setSeedError] = useState('');

  // Map an admin curriculum payload (full video handles) into editor state.
  const mapLoaded = (data) =>
    (data?.sections || []).map((s) => ({
      title: s.title || '',
      autoKey: s.autoKey,
      generated: s.generated,
      lessons: (s.lessons || []).map((l) => ({
        title: l.title || '',
        duration: l.duration || '',
        isPreview: Boolean(l.isPreview),
        description: l.description || '',
        generated: l.generated,
        autoKey: l.autoKey,
        video:
          l.video && (l.video.playbackId || l.video.assetId || l.video.embedUrl || l.video.sourceId)
            ? {
                provider: l.video.provider || 'mux',
                assetId: l.video.assetId,
                playbackId: l.video.playbackId,
                uploadId: l.video.uploadId,
                status: l.video.status,
                policy: l.video.policy,
                sourceId: l.video.sourceId,
                url: l.video.url,
                embedUrl: l.video.embedUrl,
                embeddable: l.video.embeddable,
                license: l.video.license,
                sourceTitle: l.video.sourceTitle,
                duration: l.video.duration,
                captions: l.video.captions,
              }
            : null,
      })),
    }));

  const loadCurriculum = useCallback(async () => {
    if (!isEdit) return;
    try {
      const res = await api.get(`/api/courses/${course._id}/curriculum`);
      setSections(mapLoaded(res.data?.data));
    } catch {
      /* leave existing state */
    }
  }, [isEdit, course]);

  useEffect(() => {
    let active = true;
    if (!isEdit) return undefined;
    api
      .get(`/api/courses/${course._id}/curriculum`)
      .then((res) => {
        if (active) setSections(mapLoaded(res.data?.data));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isEdit, course]);

  const runAutoGenerate = async (mode) => {
    if (generating) return;
    setGenerating(true);
    setSeedError('');
    setSeedReport(null);
    try {
      const { report } = await autoGenerateCourse(course._id, mode);
      setSeedReport(report);
      await loadCurriculum(); // reflect the generated curriculum in the editor
    } catch (err) {
      setSeedError(err.response?.data?.error || 'Auto-generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ---- Curriculum editing helpers ----
  const addSection = () => setSections((prev) => [...prev, emptySection()]);
  const removeSection = (si) => setSections((prev) => prev.filter((_, i) => i !== si));
  const moveSection = (si, delta) => setSections((prev) => move(prev, si, delta));
  const updateSectionTitle = (si, value) =>
    setSections((prev) => prev.map((s, i) => (i === si ? { ...s, title: value } : s)));

  const addLesson = (si) =>
    setSections((prev) =>
      prev.map((s, i) => (i === si ? { ...s, lessons: [...s.lessons, emptyLesson()] } : s))
    );
  const removeLesson = (si, li) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, lessons: s.lessons.filter((_, j) => j !== li) } : s
      )
    );
  const moveLesson = (si, li, delta) =>
    setSections((prev) =>
      prev.map((s, i) => (i === si ? { ...s, lessons: move(s.lessons, li, delta) } : s))
    );
  const updateLesson = (si, li, field, value) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === si
          ? {
              ...s,
              lessons: s.lessons.map((l, j) => (j === li ? { ...l, [field]: value } : l)),
            }
          : s
      )
    );
  // Replace the whole video object for a lesson (managed by LessonVideoManager).
  const updateLessonVideoObject = (si, li, videoObj) =>
    setSections((prev) =>
      prev.map((s, i) =>
        i === si
          ? {
              ...s,
              lessons: s.lessons.map((l, j) => (j === li ? { ...l, video: videoObj || null } : l)),
            }
          : s
      )
    );

  const saveCurriculum = async () => {
    if (savingCurriculum) return;
    if (sections.some((s) => !s.title.trim())) {
      setCurriculumMsg('Every section needs a title.');
      return;
    }
    if (sections.some((s) => s.lessons.some((l) => !l.title.trim()))) {
      setCurriculumMsg('Every lesson needs a title.');
      return;
    }
    setSavingCurriculum(true);
    setCurriculumMsg('');
    try {
      // Send the full video metadata (Mux handles + status/policy/captions)
      // only when a real video is attached; omit it entirely otherwise.
      const payloadSections = sections.map((s) => ({
        title: s.title.trim(),
        autoKey: s.autoKey || undefined,
        generated: s.generated || undefined,
        lessons: s.lessons.map((l) => {
          const lesson = {
            title: l.title.trim(),
            duration: (l.duration || '').trim() || undefined,
            isPreview: Boolean(l.isPreview),
            description: l.description || undefined,
            generated: l.generated || undefined,
            autoKey: l.autoKey || undefined,
          };
          const v = l.video;
          const isExternal = v && v.provider && v.provider !== 'mux' && (v.embedUrl || v.sourceId);
          if (isExternal) {
            lesson.video = {
              provider: v.provider,
              sourceId: v.sourceId || undefined,
              url: v.url || undefined,
              embedUrl: v.embedUrl || undefined,
              embeddable: v.embeddable != null ? v.embeddable : undefined,
              license: v.license || undefined,
              sourceTitle: v.sourceTitle || undefined,
              duration: v.duration != null ? v.duration : undefined,
            };
          } else if (v && (v.playbackId || v.assetId)) {
            lesson.video = {
              provider: v.provider || 'mux',
              assetId: v.assetId || undefined,
              playbackId: v.playbackId || undefined,
              uploadId: v.uploadId || undefined,
              status: v.status || undefined,
              policy: v.policy || undefined,
              duration: v.duration != null ? v.duration : undefined,
              captions: Array.isArray(v.captions) && v.captions.length ? v.captions : undefined,
            };
          }
          return lesson;
        }),
      }));
      await api.put(`/api/courses/${course._id}/curriculum`, { sections: payloadSections });
      setCurriculumMsg('Curriculum saved.');
    } catch (err) {
      setCurriculumMsg(err.response?.data?.error || 'Failed to save curriculum');
    } finally {
      setSavingCurriculum(false);
    }
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
    if (
      form.originalPrice !== '' &&
      (Number.isNaN(Number(form.originalPrice)) || Number(form.originalPrice) < 0)
    ) {
      setError('Original price must be a non-negative number');
      return;
    }

    // Build the payload from non-empty fields only.
    const payload = {};
    Object.keys(emptyForm).forEach((key) => {
      const val = form[key];
      if (val !== '' && val != null) payload[key] = val;
    });
    if (form.price !== '') payload.price = Number(form.price);
    if (form.originalPrice !== '') payload.originalPrice = Number(form.originalPrice);
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
              <span>Original Price (optional, for discount)</span>
              <input
                name="originalPrice"
                type="number"
                min="0"
                value={form.originalPrice}
                onChange={handleChange}
                placeholder="compare-at price"
              />
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

          {/* ---- Curriculum editor (Phase 7, Slice 1) ---- */}
          <div className="admin-curriculum">
            <div className="admin-features-header">
              <span>Curriculum (sections &amp; lessons)</span>
              {isEdit && (
                <button type="button" className="admin-btn admin-btn-small" onClick={addSection}>
                  + Add section
                </button>
              )}
            </div>

            {!isEdit ? (
              <p className="admin-muted">Save the course first, then reopen it to add curriculum.</p>
            ) : (
              <>
                {/* Auto content seeding (Phase 8.5) */}
                <div className="admin-seed">
                  <div className="admin-seed-actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary admin-btn-small"
                      onClick={() => runAutoGenerate('fill')}
                      disabled={generating}
                    >
                      {generating ? 'Generating…' : sections.length ? 'Regenerate (fill gaps)' : 'Auto-generate content'}
                    </button>
                    {sections.length > 0 && (
                      <button
                        type="button"
                        className="admin-btn admin-btn-small admin-btn-ghost"
                        onClick={() => runAutoGenerate('replace')}
                        disabled={generating}
                      >
                        Replace curriculum
                      </button>
                    )}
                  </div>
                  <p className="admin-muted admin-seed-note">
                    Builds sections &amp; lessons from this course’s title/category and attaches
                    legally embeddable videos. Auto-generated items are marked “Auto” — review before publishing.
                  </p>
                  {seedError && <p className="admin-error">{seedError}</p>}
                  {seedReport && (
                    <div className="admin-seed-report">
                      <span>
                        {seedReport.sectionCount} sections · {seedReport.lessonCount} lessons ·{' '}
                        {seedReport.withVideoCount} with video
                        {!seedReport.providerConfigured && (
                          <span className="admin-seed-warn"> · video provider not configured</span>
                        )}
                      </span>
                      {seedReport.missingVideo.length > 0 && (
                        <ul className="admin-seed-missing">
                          {seedReport.missingVideo.map((m, i) => (
                            <li key={i}>
                              ⚠ {m.title} — {m.status === 'not-embeddable' ? 'not embeddable' : 'no video found'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {sections.length === 0 && <p className="admin-muted">No sections yet.</p>}
                {sections.map((section, si) => (
                  <div key={si} className="admin-section-card">
                    <div className="admin-section-row">
                      <input
                        className="admin-section-title"
                        placeholder={`Section ${si + 1} title`}
                        value={section.title}
                        onChange={(e) => updateSectionTitle(si, e.target.value)}
                      />
                      <div className="admin-reorder">
                        <button type="button" className="admin-btn admin-btn-small" onClick={() => moveSection(si, -1)} disabled={si === 0} aria-label="Move section up">↑</button>
                        <button type="button" className="admin-btn admin-btn-small" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1} aria-label="Move section down">↓</button>
                        <button type="button" className="admin-btn admin-btn-danger admin-btn-small" onClick={() => removeSection(si)}>Remove</button>
                      </div>
                    </div>

                    {section.lessons.map((lesson, li) => (
                      <div key={li} className={`admin-lesson-card${lesson.generated ? ' is-generated' : ''}`}>
                        <div className="admin-lesson-main">
                          {lesson.generated && <span className="admin-auto-badge" title="Auto-generated">Auto</span>}
                          <input
                            placeholder={`Lesson ${li + 1} title`}
                            value={lesson.title}
                            onChange={(e) => updateLesson(si, li, 'title', e.target.value)}
                          />
                          <input
                            className="admin-lesson-duration"
                            placeholder="Duration (e.g. 8:24)"
                            value={lesson.duration}
                            onChange={(e) => updateLesson(si, li, 'duration', e.target.value)}
                          />
                          <label className="admin-lesson-preview">
                            <input
                              type="checkbox"
                              checked={lesson.isPreview}
                              onChange={(e) => updateLesson(si, li, 'isPreview', e.target.checked)}
                            />
                            <span>Preview</span>
                          </label>
                          <div className="admin-reorder">
                            <button type="button" className="admin-btn admin-btn-small" onClick={() => moveLesson(si, li, -1)} disabled={li === 0} aria-label="Move lesson up">↑</button>
                            <button type="button" className="admin-btn admin-btn-small" onClick={() => moveLesson(si, li, 1)} disabled={li === section.lessons.length - 1} aria-label="Move lesson down">↓</button>
                            <button type="button" className="admin-btn admin-btn-danger admin-btn-small" onClick={() => removeLesson(si, li)}>✕</button>
                          </div>
                        </div>
                        <div className="admin-lesson-video">
                          <LessonVideoManager
                            courseId={course._id}
                            video={lesson.video}
                            onChange={(v) => updateLessonVideoObject(si, li, v)}
                          />
                        </div>
                      </div>
                    ))}

                    <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => addLesson(si)}>
                      + Add lesson
                    </button>
                  </div>
                ))}

                <div className="admin-curriculum-actions">
                  {curriculumMsg && <span className="admin-muted">{curriculumMsg}</span>}
                  <button type="button" className="admin-btn admin-btn-primary admin-btn-small" onClick={saveCurriculum} disabled={savingCurriculum}>
                    {savingCurriculum ? 'Saving…' : 'Save Curriculum'}
                  </button>
                </div>
              </>
            )}
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
