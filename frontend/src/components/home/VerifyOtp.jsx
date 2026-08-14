import React, { useState, useContext } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import '../css/Login.css';

function VerifyOtp() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useContext(UserContext);

  const [email, setEmail] = useState(location.state?.email || '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const response = await api.post('/api/auth/verify-otp', { email, otp });
      login(response.data.token, response.data.data);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    try {
      await api.post('/api/auth/resend-otp', { email });
      setMessage('A new verification code has been sent to your email.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not resend code');
    }
  };

  return (
    <div className="login-container">
      <div className="login-form">
        <h2>Verify your email</h2>
        <p>Enter the 6-digit code we sent to your email address.</p>
        <form onSubmit={handleVerify}>
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
          <div className="form-group">
            <label>Verification Code</label>
            <input
              type="text"
              name="otp"
              placeholder="Enter 6-digit code"
              inputMode="numeric"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="login-button" disabled={submitting}>
            {submitting ? 'VERIFYING...' : 'VERIFY'}
          </button>
        </form>
        <p>
          Didn&apos;t get a code?{' '}
          <span className="forgot-password" style={{ cursor: 'pointer' }} onClick={handleResend}>
            Resend code
          </span>
        </p>
        <p>
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export default VerifyOtp;
