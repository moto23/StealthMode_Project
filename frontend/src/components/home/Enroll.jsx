import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import { CartContext } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { buyNowSingle } from '../../services/checkout';
import { formatINR, hasDiscount, discountPercent, isPaid } from '../../services/price';
import { CardSkeleton } from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import '../css/Enroll.css';
// Reviews are out of scope for this project and intentionally disabled.

const greenTickIcon = 'https://cdn-icons-png.flaticon.com/128/190/190411.png';

function Enroll() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [hasAccess, setHasAccess] = useState(false); // enrolled (free) or purchased (paid)
  const [featureImage, setFeatureImage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { user } = useContext(UserContext);
  const { addToCart, inCart } = useContext(CartContext);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadError(false);
      try {
        const res = await api.get(`/api/courses/${id}`);
        if (!active) return;
        setCourse(res.data);
        setFeatureImage(res.data.featureImage || '');

        if (user) {
          // Access = a free enrollment OR a verified paid purchase (both create
          // an Enrolled record; paid access is also confirmed via payment status).
          try {
            const enrolledRes = await api.get(`/api/courses/enrolled/${user._id}`);
            const owned = (enrolledRes.data || []).some(
              (e) => String(e.courseId?._id || e.courseId) === String(id)
            );
            if (active && owned) setHasAccess(true);
          } catch (e) {
            /* non-fatal */
          }
          if (Number(res.data.price) > 0) {
            try {
              const st = await api.get(`/api/payments/status/${id}`);
              if (active && st.data.purchased) setHasAccess(true);
            } catch (e) {
              /* non-fatal */
            }
          }
        }
      } catch (error) {
        console.error('Error fetching course data:', error.response?.data || error.message);
        if (active) setLoadError(true);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id, user, reloadKey]);

  // Free enrollment (price === 0 only; the backend also enforces this).
  const handleEnroll = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (processing) return;
    setProcessing(true);
    try {
      await api.post('/api/courses/enroll', { courseId: course._id });
      setHasAccess(true);
      toast.success('Enrolled successfully! Find it in your profile.');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Enrollment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Paid single-course Buy Now (unchanged Phase 3 flow, via shared service).
  const handleBuyNow = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (processing) return;
    setProcessing(true);
    await buyNowSingle({
      course,
      user,
      onSuccess: () => {
        setHasAccess(true);
        setProcessing(false);
        toast.success('Course purchased successfully! Find it in your profile.');
      },
      onError: (msg) => {
        toast.error(msg);
        setProcessing(false);
      },
      onDismiss: () => setProcessing(false),
    });
  };

  const handleAddToCart = () => {
    if (inCart(course._id)) {
      navigate('/cart');
      return;
    }
    addToCart(course);
    toast.success('Added to your cart');
  };

  if (loadError && !course) {
    return (
      <div className="cd-page">
        <ErrorState
          title="Couldn’t load this course"
          message="The course details failed to load. Please try again."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="cd-page">
        <div className="cd-grid">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const paid = isPaid(course);
  const discounted = hasDiscount(course);

  return (
    <div className="cd-page">
      <nav className="cd-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link> <span aria-hidden="true">›</span>{' '}
        <Link to="/dashboard">Courses</Link> <span aria-hidden="true">›</span>{' '}
        <span className="cd-breadcrumb-current">{course.title}</span>
      </nav>

      <div className="cd-grid">
        <div className="cd-main">
          {course.label && <span className="cd-label">{course.label}</span>}
          <h1 className="cd-title">{course.title}</h1>
          {course.description && <p className="cd-desc">{course.description}</p>}

          <ul className="cd-meta">
            {course.instructor && <li><span>Instructor</span>{course.instructor}</li>}
            {course.category && <li><span>Category</span>{course.category}</li>}
            {course.level && <li><span>Level</span>{course.level}</li>}
            {course.duration && <li><span>Duration</span>{course.duration}</li>}
            {course.registrationDate && (
              <li><span>Registration</span>{new Date(course.registrationDate).toLocaleDateString()}</li>
            )}
          </ul>

          {course.imageUrl && (
            <div className="cd-hero-img">
              <img src={course.imageUrl} alt={course.title} />
            </div>
          )}

          {Array.isArray(course.sections) && course.sections.length > 0 && (
            <div className="cd-curriculum">
              <h2>Course content</h2>
              <p className="cd-curriculum-meta">
                {course.sections.length} {course.sections.length === 1 ? 'section' : 'sections'}
                {' • '}
                {course.sections.reduce((n, s) => n + (s.lessons ? s.lessons.length : 0), 0)} lessons
              </p>
              <div className="cd-sections">
                {course.sections.map((section) => (
                  <div key={section._id} className="cd-section">
                    <div className="cd-section-head">
                      <h3>{section.title}</h3>
                      <span className="cd-section-count">
                        {(section.lessons ? section.lessons.length : 0)} lessons
                      </span>
                    </div>
                    {Array.isArray(section.lessons) && section.lessons.length > 0 && (
                      <ul className="cd-lessons">
                        {section.lessons.map((lesson) => (
                          <li key={lesson._id} className="cd-lesson">
                            <span className="cd-lesson-icon" aria-hidden="true">▷</span>
                            <span className="cd-lesson-title">{lesson.title}</span>
                            {lesson.isPreview && <span className="cd-lesson-preview">Preview</span>}
                            {lesson.duration && <span className="cd-lesson-duration">{lesson.duration}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {Array.isArray(course.features) && course.features.length > 0 && (
            <div className="cd-features">
              <h2>What this course covers</h2>
              <div className="cd-features-grid">
                {course.features.map((feature, index) => (
                  <div key={index} className="cd-feature">
                    <img src={greenTickIcon} alt="" className="cd-feature-tick" aria-hidden="true" />
                    <div>
                      <h3>{feature.title}</h3>
                      {feature.description && <p>{feature.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {featureImage && (
            <div className="cd-feature-banner">
              <img src={featureImage} alt="Course preview" />
            </div>
          )}
        </div>

        <aside className="cd-purchase">
          <div className="cd-purchase-card">
            <div className="cd-price">
              {paid ? (
                <>
                  <span className="cd-price-current">{formatINR(course.price)}</span>
                  {discounted && (
                    <span className="cd-price-meta">
                      <span className="cd-price-original">{formatINR(course.originalPrice)}</span>
                      <span className="cd-price-off">{discountPercent(course)}% off</span>
                    </span>
                  )}
                </>
              ) : (
                <span className="cd-price-current cd-price-free">Free</span>
              )}
            </div>

            {hasAccess ? (
              <button className="cd-btn cd-btn-owned" disabled>
                {paid ? '✓ Purchased' : '✓ Enrolled'}
              </button>
            ) : paid ? (
              <div className="cd-actions">
                <button className="cd-btn cd-btn-primary" onClick={handleBuyNow} disabled={processing}>
                  {processing ? 'Processing…' : `Buy now — ${formatINR(course.price)}`}
                </button>
                <button className="cd-btn cd-btn-outline" onClick={handleAddToCart} disabled={processing}>
                  {inCart(course._id) ? 'Go to Cart' : 'Add to Cart'}
                </button>
              </div>
            ) : (
              <button className="cd-btn cd-btn-primary cd-btn-block" onClick={handleEnroll} disabled={processing}>
                {processing ? 'Enrolling…' : 'Enroll for free'}
              </button>
            )}

            <p className="cd-purchase-note">Secure checkout • Instant access after payment</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Enroll;
