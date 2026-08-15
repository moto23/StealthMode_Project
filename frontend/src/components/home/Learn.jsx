import React, { useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FaCheckCircle,
  FaRegCircle,
  FaPlayCircle,
  FaChevronLeft,
  FaChevronRight,
  FaBars,
  FaTimes,
} from 'react-icons/fa';
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
  const [drawerOpen, setDrawerOpen] = useState(false); // mobile playlist drawer (UI only)

  const activeBtnRef = useRef(null);
  const drawerToggleRef = useRef(null);
  const drawerCloseRef = useRef(null);

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
  const completedCount = useMemo(
    () => flatLessons.reduce((n, l) => n + (completed.has(String(l._id)) ? 1 : 0), 0),
    [flatLessons, completed]
  );

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

  // Selecting a lesson from the playlist also closes the mobile drawer.
  const pickLesson = (lessonId) => {
    selectLesson(lessonId);
    setDrawerOpen(false);
  };

  // Keyboard: Esc closes the drawer; ←/→ move between lessons (unless the player
  // or a form control has focus, so native controls keep their own keys).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      if (drawerOpen) return;
      const ae = document.activeElement;
      const tag = ae && ae.tagName;
      if (
        tag === 'MUX-PLAYER' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (ae && ae.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        selectLesson(flatLessons[activeIndex - 1]._id);
      } else if (e.key === 'ArrowRight' && activeIndex < flatLessons.length - 1) {
        e.preventDefault();
        selectLesson(flatLessons[activeIndex + 1]._id);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen, activeIndex, flatLessons, selectLesson]);

  // Keep the active lesson visible in the playlist when it changes.
  useEffect(() => {
    if (!activeBtnRef.current) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeBtnRef.current.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeId]);

  // Drawer focus management + body scroll lock while open (mobile).
  useEffect(() => {
    if (drawerOpen) {
      document.body.classList.add('learn-drawer-locked');
      if (drawerCloseRef.current) drawerCloseRef.current.focus();
    } else {
      document.body.classList.remove('learn-drawer-locked');
    }
    return () => document.body.classList.remove('learn-drawer-locked');
  }, [drawerOpen]);

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
        <div className="learn-skeleton" aria-hidden="true">
          <div className="learn-skeleton-side" />
          <div className="learn-skeleton-main">
            <div className="learn-skeleton-video" />
            <div className="learn-skeleton-line" />
            <div className="learn-skeleton-line short" />
          </div>
        </div>
        <p className="learn-loading" role="status" aria-live="polite">Loading your course…</p>
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

  const totalLessons = flatLessons.length;
  const activeDone = completed.has(String(activeId));
  const nextLesson = activeIndex >= 0 && activeIndex < totalLessons - 1 ? flatLessons[activeIndex + 1] : null;

  const progressBlock = (
    <div className="learn-progress">
      <div
        className="learn-progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Course progress"
      >
        <span className="learn-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="learn-progress-meta">
        <span className="learn-progress-count">{completedCount} of {totalLessons} lessons</span>
        <span className="learn-progress-pct">{percent}%</span>
      </div>
    </div>
  );

  return (
    <div className={`learn-page learn-shell${drawerOpen ? ' drawer-open' : ''}`}>
      {/* Mobile top bar */}
      <div className="learn-topbar">
        <Link to={`/enroll/${courseId}`} className="learn-back">
          <FaChevronLeft aria-hidden="true" /> Course
        </Link>
        <button
          type="button"
          ref={drawerToggleRef}
          className="learn-drawer-toggle"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          aria-controls="learn-playlist-panel"
        >
          <FaBars aria-hidden="true" />
          <span>Lessons</span>
          <span className="learn-drawer-toggle-count">{completedCount}/{totalLessons}</span>
        </button>
      </div>

      {/* Drawer backdrop (mobile) */}
      <div
        className="learn-backdrop"
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="learn-playlist-panel"
        className={`learn-sidebar${drawerOpen ? ' is-open' : ''}`}
      >
        <div className="learn-sidebar-head">
          <div className="learn-sidebar-head-top">
            <Link to={`/enroll/${courseId}`} className="learn-back learn-back-desktop">
              <FaChevronLeft aria-hidden="true" /> Course
            </Link>
            <button
              type="button"
              ref={drawerCloseRef}
              className="learn-drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close lessons"
            >
              <FaTimes aria-hidden="true" />
            </button>
          </div>
          <h2 className="learn-course-title">{data.title}</h2>
          {progressBlock}
        </div>

        <nav className="learn-playlist" aria-label="Course lessons">
          {data.sections.map((section, si) => {
            const lessons = section.lessons || [];
            return (
              <div key={section._id} className="learn-section">
                <div className="learn-section-head">
                  <span className="learn-section-index" aria-hidden="true">{si + 1}</span>
                  <span className="learn-section-title">{section.title}</span>
                  <span className="learn-section-count">{lessons.length}</span>
                </div>
                <ul>
                  {lessons.map((lesson) => {
                    const id = String(lesson._id);
                    const isDone = completed.has(id);
                    const isActive = id === String(activeId);
                    const stateClass = `${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          ref={isActive ? activeBtnRef : null}
                          className={`learn-lesson-item${stateClass}`}
                          onClick={() => pickLesson(id)}
                          aria-current={isActive ? 'true' : undefined}
                        >
                          <span className="learn-lesson-status" aria-hidden="true">
                            {isDone ? (
                              <FaCheckCircle className="i-done" />
                            ) : isActive ? (
                              <FaPlayCircle className="i-active" />
                            ) : (
                              <FaRegCircle className="i-idle" />
                            )}
                          </span>
                          <span className="learn-lesson-body">
                            <span className="learn-lesson-name">{lesson.title}</span>
                            {(lesson.duration || lesson.isPreview) && (
                              <span className="learn-lesson-metarow">
                                {lesson.isPreview && <span className="learn-lesson-badge">Preview</span>}
                                {lesson.duration && <span className="learn-lesson-dur">{lesson.duration}</span>}
                              </span>
                            )}
                          </span>
                          {isActive && <span className="learn-lesson-nowtag">Now playing</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
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
              <span className="learn-lesson-eyebrow">
                {activeLesson.sectionTitle} · Lesson {activeIndex + 1} of {totalLessons}
              </span>
              <h1>{activeLesson.title}</h1>
              <div className="learn-lesson-metaline">
                {activeLesson.duration && <span className="learn-lesson-meta">{activeLesson.duration}</span>}
                {activeDone && <span className="learn-lesson-donepill"><FaCheckCircle aria-hidden="true" /> Completed</span>}
              </div>
            </div>

            {percent === 100 && (
              <div className="learn-complete-banner" role="status">
                🎉 You’ve completed every lesson in this course. Nicely done.
              </div>
            )}

            <div className="learn-controls">
              <button
                type="button"
                className="sm-btn sm-btn-outline learn-nav-btn"
                onClick={() => goTo(activeIndex - 1)}
                disabled={activeIndex <= 0}
              >
                <FaChevronLeft aria-hidden="true" /> Previous
              </button>

              <button
                type="button"
                className={`sm-btn ${activeDone ? 'sm-btn-outline' : 'sm-btn-primary'} learn-complete`}
                onClick={() => toggleComplete(activeId)}
              >
                {activeDone ? (
                  <><FaCheckCircle aria-hidden="true" /> Completed — mark incomplete</>
                ) : (
                  'Mark as complete'
                )}
              </button>

              <button
                type="button"
                className="sm-btn sm-btn-outline learn-nav-btn"
                onClick={() => goTo(activeIndex + 1)}
                disabled={activeIndex >= totalLessons - 1}
              >
                Next <FaChevronRight aria-hidden="true" />
              </button>
            </div>

            {nextLesson && (
              <button
                type="button"
                className="learn-upnext"
                onClick={() => goTo(activeIndex + 1)}
              >
                <span className="learn-upnext-label">Up next</span>
                <span className="learn-upnext-title">
                  <FaPlayCircle aria-hidden="true" /> {nextLesson.title}
                </span>
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default Learn;
