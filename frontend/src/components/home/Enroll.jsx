import React, { useEffect, useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import '../css/Enroll.css';
// Reviews are out of scope for this project and intentionally disabled.

const greenTickIcon = 'https://cdn-icons-png.flaticon.com/128/190/190411.png';

// Load the Razorpay checkout script on demand (not bundled/global).
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

function Enroll() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [hasAccess, setHasAccess] = useState(false); // enrolled (free) or purchased (paid)
  const [featureImage, setFeatureImage] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [processing, setProcessing] = useState(false);
  const { user } = useContext(UserContext);

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
      alert('Please register or log in to enroll in the course.');
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

  // Paid purchase via Razorpay. Order + amount + key all come from the server;
  // no key or amount is hardcoded here.
  const handleBuyNow = async () => {
    if (!user) {
      alert('Please register or log in to buy the course.');
      return;
    }
    if (processing) return;
    setProcessing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        alert('Failed to load the payment gateway. Please try again.');
        setProcessing(false);
        return;
      }

      const orderResponse = await api.post('/api/payments/create-order', {
        courseId: course._id,
      });
      const { orderId, amount, currency, key } = orderResponse.data.data;

      const options = {
        key, // server-provided test key id (never a secret)
        amount: String(amount), // paise, computed server-side from the DB price
        currency,
        name: 'StealthMode',
        description: course.title,
        order_id: orderId,
        handler: async (response) => {
          try {
            const verify = await api.post('/api/payments/verify', {
              orderId,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            if (verify.data.success) {
              setHasAccess(true);
              setShowPopup(true);
            } else {
              alert('Payment verification failed. Please contact support.');
            }
          } catch (err) {
            alert(err.response?.data?.error || 'Payment verification failed.');
          } finally {
            setProcessing(false);
          }
        },
        prefill: { name: user.fullName, email: user.email },
        theme: { color: '#5a3d2c' },
        modal: { ondismiss: () => setProcessing(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', () => {
        alert('Payment failed. Please try again.');
        setProcessing(false);
      });
      rzp.open();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to initiate payment. Please try again.');
      setProcessing(false);
    }
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

  const isPaid = Number(course.price) > 0;

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
          <p className="price">Price: {isPaid ? `₹${course.price}` : 'Free'}</p>

          <p className="enroll-now">Admission Closing Soon! ENROLL NOW!</p>

          {hasAccess ? (
            <button className="purchased-button" disabled>
              {isPaid ? 'Purchased' : 'Enrolled'}
            </button>
          ) : isPaid ? (
            <button className="enroll-button" onClick={handleBuyNow} disabled={processing}>
              {processing ? 'Processing…' : `Buy now — ₹${course.price}`}
            </button>
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
