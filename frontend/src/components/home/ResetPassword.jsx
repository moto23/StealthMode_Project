import React, { useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import '../css/ResetPassword.css';

function ResetPassword() {
  const { token } = useParams();
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const response = await axios.post(`https://sleath-backend.vercel.app/api/auth/reset-password/${token}`, {
        password: formData.password,
      });

      setMessage(response.data.message);
      setError('');
      navigate('/login');
    } catch (error) {
      setError(error.response.data.error || 'Something went wrong');
      setMessage('');
    }
  };

  return (
    <div className="reset-password-container">
      <div className="reset-password-form">
        <h2>Reset Password</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>New Password</label>
            <input
              type="password"
              name="password"
              placeholder="Enter new password"
              required
              value={formData.password}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm new password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
            />
          </div>
          {message && <p className="success">{message}</p>}
          {error && <p className="error">{error}</p>}
          <button type="submit" className="reset-password-button">Reset Password</button>
        </form>
      </div>
    </div>
  );
}

export default ResetPassword;
