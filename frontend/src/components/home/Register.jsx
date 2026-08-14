import React, { useState } from 'react';
import api from '../../services/api';
import { Link, useNavigate } from 'react-router-dom';
import PasswordInput from './PasswordInput';
import '../css/Register.css';

function Register() {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordMessage, setConfirmPasswordMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (name === 'email') {
      setEmailError(value.includes('@') ? '' : 'Enter a valid email');
    }

    if (name === 'password') {
      setPasswordError(value.length >= 6 ? '' : 'Enter a valid password');
    }

    if (name === 'confirmPassword') {
      setConfirmPasswordMessage(value === formData.password ? 'Passwords match' : '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Prevent duplicate submissions (which would issue multiple OTPs).
    if (submitting) return;

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (emailError || passwordError) {
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/auth/register', {
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
      });

      // Registration issues an OTP by email; proceed to verification.
      navigate('/verify-otp', { state: { email: formData.email } });
    } catch (error) {
      setError(error.response?.data?.error || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-image">
        <img src="https://www.shutterstock.com/image-vector/male-personage-concentrated-working-project-600nw-1896311938.jpg" alt="Form" />
      </div>
      <div className="register-form">
        <h2>Sign Up</h2>
        <p>Already have an account? <Link to="/login" className="sign-in-link">Login</Link></p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              name="fullName"
              placeholder="Your Full Name"
              required
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
              onChange={handleChange}
            />
            {emailError && <p className="error">{emailError}</p>}
          </div>
          <div className="form-group">
            <label>Password</label>
            <PasswordInput
              name="password"
              placeholder="Enter 6 characters or more"
              onChange={handleChange}
            />
            {passwordError && <p className="error">{passwordError}</p>}
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <PasswordInput
              name="confirmPassword"
              placeholder="Confirm your password"
              onChange={handleChange}
            />
            {confirmPasswordMessage && <p className="success">{confirmPasswordMessage}</p>}
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="register-button" disabled={submitting}>
            {submitting ? 'SIGNING UP...' : 'SIGN UP'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Register;
