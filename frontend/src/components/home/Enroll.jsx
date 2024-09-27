import React, { useEffect, useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { UserContext } from '../../context/UserContext';
import '../css/Enroll.css';
import Review from './Review';


const greenTickIcon = 'https://cdn-icons-png.flaticon.com/128/190/190411.png';

function Enroll() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [purchased, setPurchased] = useState(false);
  const [featureImage, setFeatureImage] = useState('');
  const [showPopup, setShowPopup] = useState(false); // State to manage popup visibility
  const { user } = useContext(UserContext);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await axios.get(`https://sleath-backend.vercel.app/api/courses/${id}`);
        setCourse(response.data);
        setFeatureImage(response.data.featureImage);

        // Check if the user has already purchased the course
        if (user) {
          const purchaseResponse = await axios.get(`https://sleath-backend.vercel.app/api/courses/purchased/${user._id}/${id}`);
          setPurchased(purchaseResponse.data.purchased);
        }
      } catch (error) {
        console.error('Error fetching course data:', error);
      }
    };

    const checkEnrollment = () => {
      const localEnrolled = JSON.parse(localStorage.getItem('enrolledCourses')) || [];
      setEnrolledCourses(localEnrolled);
    };

    fetchCourse();
    checkEnrollment();
  }, [id, user]);

  const handleEnroll = async () => {
    if (!user) {
      alert('Please register or log in to enroll in the course.');
      return;
    }

    try {
      const response = await axios.post('https://sleath-backend.vercel.app/api/courses/enroll', {
        userId: user._id,
        courseId: course._id,
      });
      console.log(response.data);
      setEnrolledCourses([...enrolledCourses, course._id]);
      localStorage.setItem('enrolledCourses', JSON.stringify([...enrolledCourses, course._id]));
      setShowPopup(true); // Show popup on successful enrollment
    } catch (error) {
      console.error('Error enrolling in course:', error.response.data);
    }
  };

  const handleBuyNow = async () => {
    if (!user) {
      alert('Please register or log in to buy the course.');
      return;
    }

    try {
      // Convert the price from USD to INR (assuming 1 USD = 75 INR)
      const exchangeRate = 75; // You can update this value or fetch it dynamically
      const amountInINR = course.price * exchangeRate * 100; // Convert to paise

      const orderResponse = await axios.post('https://sleath-backend.vercel.app/api/courses/create-order', {
        amount: amountInINR,
        currency: 'INR',
        receipt: `receipt_order_${id}_${user._id}`,
      });

      const { amount, id: order_id, currency } = orderResponse.data;

      const options = {
        key: 'rzp_live_Bpr9gl2MB96XGf', // Replace with your Razorpay key ID
        amount: amount.toString(),
        currency: currency,
        name: 'Course Purchase',
        description: course.title,
        order_id: order_id,
        handler: async function (response) {
          try {
            const paymentVerification = await axios.post('https://sleath-backend.vercel.app/api/courses/verify-payment', {
              order_id: order_id,
              payment_id: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              userId: user._id,
              courseId: course._id,
            });

            if (paymentVerification.data.success) {
              setPurchased(true);
              setShowPopup(true);
            } else {
              alert('Payment verification failed. Please try again.');
            }
          } catch (error) {
            console.error('Error verifying payment:', error);
            alert('Payment verification failed. Please try again.');
          }
        },
        prefill: {
          name: user.fullName,
          email: user.email,
        },
        notes: {
          address: 'Razorpay Corporate Office',
        },
        theme: {
          color: '#3399cc',
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (error) {
      console.error('Error creating Razorpay order:', error);
      alert('Failed to initiate payment. Please try again.');
    }
  };

  const Popup = () => (
    <div className="popup">
      <div className="popup-content">
        <h2>{purchased ? 'Course Purchased Successfully' : 'Hurry! Course Added Successfully You may check profile'}</h2>
        <button className="close-button" onClick={() => setShowPopup(false)}>
          Close
        </button>
      </div>
    </div>
  );

  if (!course) {
    return <div>Loading...</div>;
  }

  return (
    <div className="enroll-container">
      {showPopup && <Popup />} {/* Render Popup if showPopup is true */}
      <nav className="breadcrumb">
        <a href="/">Home</a> &gt; <a href="/dashboard">Courses</a> &gt; <span>{course.title}</span>
      </nav>
      <div className="enroll-content">
        <div className="enroll-details">
          <span className="label">{course.label}</span>
          <h1>{course.title}</h1>
          <p>{course.description}</p>
          <p className="price">Price: ${course.price}</p>
          
          <p className="enroll-now">Admission Closing Soon! ENROLL NOW!</p>
          {!purchased && (
            <>
              <button
                className="enroll-button"
                onClick={handleEnroll}
                disabled={enrolledCourses.includes(course._id)}
              >
                {enrolledCourses.includes(course._id) ? 'Added' : 'Add to cart'}
              </button>
              <button className="enroll-button" onClick={handleBuyNow}>
                Buy now
              </button>
            </>
          )}
          {purchased && <button className="purchased-button" disabled>Purchased</button>}
        </div>
        <div className="enroll-image">
          <img src={course.imageUrl} alt={`Image of ${course.title}`} />
        </div>
      </div>
      <div className="features-section">
        <div className="features-left">
          <h2>Features of the Course</h2>
          {course.features && course.features.map((feature, index) => (
            <div key={index} className="feature">
              <img src={greenTickIcon} alt="Green Tick" className="green-tick-icon" /> {/* Green tick icon */}
              <div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="features-right">
          <img src={featureImage} alt="Feature of the course" />
        </div>
      </div>
      <Review courseId={course._id} /> {/* Add the Review component */}
    </div>
  );
}

export default Enroll;
