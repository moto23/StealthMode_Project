import React, { useEffect, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import { CartContext } from '../../context/CartContext';
import { buyNowSingle } from '../../services/checkout';
import { formatINR, hasDiscount, discountPercent, isPaid } from '../../services/price';
import '../css/Enroll.css';
// Reviews are out of scope for this project and intentionally disabled.

const greenTickIcon = 'https://cdn-icons-png.flaticon.com/128/190/190411.png';

function Enroll() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [hasAccess, setHasAccess] = useState(false); // enrolled (free) or purchased (paid)
  const [featureImage, setFeatureImage] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [processing, setProcessing] = useState(false);
  const { user } = useContext(UserContext);
  const { addToCart, inCart } = useContext(CartContext);

  useEffect(() => {
    let active = true;
    const load = async () => {
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
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [id, user]);

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
      setShowPopup(true);
    } catch (error) {
      alert(error.response?.data?.error || 'Enrollment failed. Please try again.');
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
        setShowPopup(true);
        setProcessing(false);
      },
      onError: (msg) => {
        alert(msg);
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
  };

  const Popup = () => (
    <div className="popup">
      <div className="popup-content">
        <h2>
          {course && Number(course.price) > 0
            ? 'Course Purchased Successfully! Check your profile.'
            : 'Enrolled Successfully! Check your profile.'}
        </h2>
        <button className="close-button" onClick={() => setShowPopup(false)}>
          Close
        </button>
      </div>
    </div>
  );

  if (!course) {
    return <div>Loading...</div>;
  }

  const paid = isPaid(course);
  const discounted = hasDiscount(course);

  return (
    <div className="enroll-container">
      {showPopup && <Popup />}
      <nav className="breadcrumb">
        <a href="/">Home</a> &gt; <a href="/dashboard">Courses</a> &gt; <span>{course.title}</span>
      </nav>
      <div className="enroll-content">
        <div className="enroll-details">
          <span className="label">{course.label}</span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>

          <div className="enroll-meta">
            {course.instructor && <span><strong>Instructor:</strong> {course.instructor}</span>}
            {course.category && <span><strong>Category:</strong> {course.category}</span>}
            {course.level && <span><strong>Level:</strong> {course.level}</span>}
            {course.duration && <span><strong>Duration:</strong> {course.duration}</span>}
            {course.registrationDate && (
              <span><strong>Registration:</strong> {new Date(course.registrationDate).toLocaleDateString()}</span>
            )}
          </div>

          <div className="enroll-price">
            {paid ? (
              <>
                <span className="enroll-price-current">{formatINR(course.price)}</span>
                {discounted && (
                  <>
                    <span className="enroll-price-original">{formatINR(course.originalPrice)}</span>
                    <span className="enroll-price-off">{discountPercent(course)}% off</span>
                  </>
                )}
              </>
            ) : (
              <span className="enroll-price-current enroll-price-free">Free</span>
            )}
          </div>

          <p className="enroll-now">Admission Closing Soon! ENROLL NOW!</p>

          {hasAccess ? (
            <button className="purchased-button" disabled>
              {paid ? 'Purchased' : 'Enrolled'}
            </button>
          ) : paid ? (
            <div className="enroll-actions">
              <button className="cart-button" onClick={handleAddToCart} disabled={processing}>
                {inCart(course._id) ? 'Go to Cart' : 'Add to Cart'}
              </button>
              <button className="enroll-button" onClick={handleBuyNow} disabled={processing}>
                {processing ? 'Processing…' : `Buy now — ${formatINR(course.price)}`}
              </button>
            </div>
          ) : (
            <button className="enroll-button" onClick={handleEnroll} disabled={processing}>
              {processing ? 'Enrolling…' : 'Enroll for free'}
            </button>
          )}
        </div>
        <div className="enroll-image">
          <img src={course.imageUrl} alt={course.title} />
        </div>
      </div>
      <div className="features-section">
        <div className="features-left">
          <h2>Features of the Course</h2>
          {course.features &&
            course.features.map((feature, index) => (
              <div key={index} className="feature">
                <img src={greenTickIcon} alt="Green Tick" className="green-tick-icon" />
                <div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              </div>
            ))}
        </div>
        <div className="features-right">
          <img src={featureImage} alt="Course feature" />
        </div>
      </div>
    </div>
  );
}

export default Enroll;
