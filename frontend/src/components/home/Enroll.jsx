import React, { useEffect, useState, useContext } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { UserContext } from '../../context/UserContext';
import '../css/Enroll.css';

// Green tick SVG URL (example)
const greenTickIcon = 'https://cdn-icons-png.flaticon.com/128/190/190411.png';

function Enroll() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [enrolled, setEnrolled] = useState(false);
  const [featureImage, setFeatureImage] = useState('');
  const [showPopup, setShowPopup] = useState(false); // State to manage popup visibility
  const { user } = useContext(UserContext);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const response = await axios.get(`https://sleath-backend.vercel.app/api/courses/${id}`);
        setCourse(response.data);
        setFeatureImage(response.data.featureImage);
      } catch (error) {
        console.error('Error fetching course data:', error);
      }
    };

    const checkEnrollment = () => {
      const localEnrolled = localStorage.getItem(`enrolled_${id}`);
      if (localEnrolled === 'false') {
        setEnrolled(true);
      } else {
        setEnrolled(false);
      }
    };

    fetchCourse();
    checkEnrollment();
  }, [id]);

  

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
    
    if (response.data) {
      console.log(response.data);
      setEnrolled(true);
      localStorage.setItem(`enrolled_${id}`, 'true');
      setShowPopup(true); // Show popup on successful enrollment
    } else {
      console.error('Unexpected response:', response);
    }
  } catch (error) {
    console.error('Error enrolling in course:', error);
  }
};


  
  const Popup = () => (
    <div className="popup">
      <div className="popup-content">
        <h2>Hurry! Course Enrolled Successfully</h2>
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
          
          <p className="enroll-now">Admission Closing Soon! ENROLL NOW!</p>
          <button className="enroll-button" onClick={handleEnroll} disabled={enrolled}>
            {enrolled ? 'Enrolled' : 'Enroll Now'}
          </button>
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
    </div>
  );
}

export default Enroll;


