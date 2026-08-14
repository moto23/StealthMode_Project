import axios from 'axios';

// Centralized API client. The backend base URL comes from the environment
// (REACT_APP_API_URL) so it is never hardcoded across components.
const API_URL =
  process.env.REACT_APP_API_URL || 'https://sleath-backend.vercel.app';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the JWT (if present) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth token helpers.
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

export const getAuthToken = () => localStorage.getItem('authToken');

export default api;
