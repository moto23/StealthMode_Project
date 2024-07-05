import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import '../css/ForgotPassword.css';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await axios.post('https://sleath-backend.vercel.app/api/auth/forgot-password', { email });
      setMessage(response.data.message);
      setError('');
    } catch (error) {
      setError(error.response.data.error || 'Something went wrong');
      setMessage('');
    }
  };

  return (
    <div className="forgot-password-container">
      <div className="forgot-password-form">
        <h2>Forgot Password</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="forgot-password-button">Send Reset Link</button>
        </form>
        <p><Link to="/login">Back to Login</Link></p>
      </div>
    </div>
  );
}

export default ForgotPassword;
