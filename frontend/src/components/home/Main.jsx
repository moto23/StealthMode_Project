import React from 'react';
import { Link } from 'react-router-dom';
import TypingEffect from './TypingEffect';
import '../css/Main.css';

function Main() {
  const words = ["EASY", "FREE", "PRACTICAL"];

  return (
    <div id='main'>
      <div className="container-cg">
        <div className="overlay"></div>
        <div className="container content-container">
          <div className="row">
            <div className="col-md-8 content text-left"> {/* Added text-left class for left alignment */}
              <h1 style={{ marginBottom: '10px' }}>Stay Ahead Of The Curve</h1>
              <h1 className="typing-container" style={{ marginBottom: '10px' }}>
                With Our <TypingEffect words={words} />
              </h1>
              <h1 style={{ marginBottom: '0' }}>Courses</h1>
              <div className="home-buttons">
                <Link to="/dashboard" className="btn">Explore Courses</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Main;
