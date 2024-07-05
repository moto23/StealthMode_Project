import React from 'react';
import { Link } from 'react-router-dom';
import '../css/About.css';

function About() {
  return (
    <div id='about'>
      <div className="about">
        <div className="about-container">
          <div className="about-content">
            <div className="about-image">
              <img src="https://cdn.pixabay.com/photo/2022/04/03/18/28/webcam-7109621_1280.png" alt="About Us" />
            </div>
            <div className="about-text">
              <h2>About Us</h2>
              <p>
                We offer a variety of courses to help you learn and grow in your career. 
                Our courses are designed by industry experts and are tailored to meet the 
                demands of the modern job market. Whether you're looking to advance your 
                current skills or learn something completely new, we have a course for you.
              </p>
              <Link to="/" className="bt">Talk to counsellor</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default About;
