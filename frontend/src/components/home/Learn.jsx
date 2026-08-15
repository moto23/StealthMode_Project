import React, { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaCheckCircle, FaRegCircle, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { UserContext } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { getLearnData, markLessonComplete, setCurrentLesson } from '../../services/learn';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import LessonPlayer from '../ui/LessonPlayer';
import '../css/Learn.css';

function Learn() {
  const { courseId } = useParams();
  const { user } = useContext(UserContext);
  const toast = useToast();

  const [data, setData] = useState(null);
  const [completed, setCompleted] = useState(() => new Set());
  const [percent, setPercent] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | forbidden
  const [reloadKey, setReloadKey] = useState(0);

  // Flatten lessons in curriculum order for prev/next + resume.
  const flatLessons = useMemo(() => {
    if (!data) return [];
    const out = [];
    data.sections.forEach((s) =>
      (s.lessons || []).forEach((l) => out.push({ ...l, sectionTitle: s.title }))
    );
    return out;
  }, [data]);

  useEffect(() => {
    if (!user) return; // handled in render
    let active = true;
    setStatus('loading');
    getLearnData(courseId)
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setCompleted(new Set(payload.completedLessonIds || []));
        setPercent(payload.percent || 0);
        // Resume: saved current lesson → first incomplete → first lesson.
        const all = [];
        payload.sections.forEach((s) => (s.lessons || []).forEach((l) => all.push(l)));
        const doneSet = new Set(payload.completedLessonIds || []);
        const resume =
          payload.currentLessonId ||
          (all.find((l) => !doneSet.has(String(l._id))) || all[0] || {})._id;
        setActiveId(resume ? String(resume) : null);
        setStatus('ready');
      })
      .catch((err) => {
        if (!active) return;
        if (err.response?.status === 403) setStatus('forbidden');
        else setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [courseId, user, reloadKey]);

  const activeIndex = flatLessons.findIndex((l) => String(l._id) === String(activeId));
  const activeLesson = activeIndex >= 0 ? flatLessons[activeIndex] : null;

  const selectLesson = useCallback(
    (lessonId) => {
      setActiveId(String(lessonId));
      setCurrentLesson(courseId, lessonId).catch(() => {}); // persist resume (non-blocking)
    },
    [courseId]
  );

  const goTo = (index) => {
    if (index < 0 || index >= flatLessons.length) return;
    selectLesson(flatLessons[index]._id);
  };

  const toggleComplete = async (lessonId) => {
    const isDone = completed.has(String(lessonId));
    try {
      const res = await markLessonComplete(courseId, lessonId, !isDone);
      setCompleted(new Set(res.completedLessonIds || []));
      setPercent(res.percent || 0);
      if (!isDone) {
        // Auto-advance to the next lesson after completing.
        if (activeIndex >= 0 && activeIndex < flatLessons.length - 1) {
          goTo(activeIndex + 1);
        } else {
          toast.success('Course complete — nice work!');
        }
      }
    } catch (e) {
      toast.error('Could not update progress. Please try again.');
    }
  };

  // ---- Non-authenticated ----
  if (!user) {
    return (
      <div className="learn-page">
        <EmptyState
          icon="🔒"
          title="Please log in"
          message="Log in to access your course."
          action={<Link to="/login" className="sm-btn sm-btn-primary">Log in</Link>}
        />
      </div>
    );
  }

  if (status === 'forbidden') {
    return (
      <div className="learn-page">
        <EmptyState
          icon="🔒"
          title="You’re not enrolled"
          message="Enroll in this course to start learning."
          action={<Link to={`/enroll/${courseId}`} className="sm-btn sm-btn-primary">View course</Link>}
        />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="learn-page">
        <ErrorState
          title="Couldn’t load this course"
          message="Something went wrong loading your lessons. Please try again."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (status === 'loading' || !data) {
    return (
      <div className="learn-page">
        <div className="learn-loading">Loading your course…</div>
      </div>
    );
  }

  if (flatLessons.length === 0) {
    return (
      <div className="learn-page">
        <div className="learn-header">
          <Link to={`/enroll/${courseId}`} className="learn-back">← Back to course</Link>
          <h1>{data.title}</h1>
        </div>
        <EmptyState
          icon="📼"
          title="No lessons yet"
          message="This course doesn’t have any lessons published yet. Check back soon."
        />
      </div>
    );
  }

  return (
    <div className="learn-page learn-layout">
      <aside className="learn-sidebar">
        <div className="learn-sidebar-head">
          <Link to={`/enroll/${courseId}`} className="learn-back">← Course</Link>
          <h2 className="learn-course-title">{data.title}</h2>
          <div className="learn-progress">
            <div className="learn-progress-bar">
              <span style={{ width: `${percent}%` }} />
            </div>
            <span className="learn-progress-label">{percent}% complete</span>
          </div>
        </div>

        <nav className="learn-playlist" aria-label="Course lessons">
          {data.sections.map((section) => (
            <div key={section._id} className="learn-section">
              <h3 className="learn-section-title">{section.title}</h3>
              <ul>
                {(section.lessons || []).map((lesson) => {
                  const id = String(lesson._id);
                  const isDone = completed.has(id);
                  const isActive = id === String(activeId);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={`learn-lesson-item${isActive ? ' is-active' : ''}`}
                        onClick={() => selectLesson(id)}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <span className="learn-lesson-check" aria-hidden="true">
                          {isDone ? <FaCheckCircle /> : <FaRegCircle />}
                        </span>
                        <span className="learn-lesson-name">{lesson.title}</span>
                        {lesson.isPreview && <span className="learn-lesson-badge">Preview</span>}
                        {lesson.duration && <span className="learn-lesson-dur">{lesson.duration}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="learn-main">
        {activeLesson && (
          <>
            <LessonPlayer
              key={String(activeId)}
              courseId={courseId}
              lessonId={activeId}
              title={activeLesson.title}
            />

            <div className="learn-lesson-head">
              <span className="learn-lesson-eyebrow">{activeLesson.sectionTitle}</span>
              <h1>{activeLesson.title}</h1>
              {activeLesson.duration && <span className="learn-lesson-meta">{activeLesson.duration}</span>}
            </div>

            <div className="learn-controls">
              <button
                type="button"
                className="sm-btn sm-btn-outline"
                onClick={() => goTo(activeIndex - 1)}
                disabled={activeIndex <= 0}
              >
                <FaChevronLeft aria-hidden="true" /> Previous
              </button>

              <button
                type="button"
                className={`sm-btn ${completed.has(String(activeId)) ? 'sm-btn-outline' : 'sm-btn-primary'} learn-complete`}
                onClick={() => toggleComplete(activeId)}
              >
                {completed.has(String(activeId)) ? 'Completed ✓ — mark incomplete' : 'Mark as complete'}
              </button>

              <button
                type="button"
                className="sm-btn sm-btn-outline"
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex >= flatLessons.length - 1}
              >
                Next <FaChevronRight aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Learn;
