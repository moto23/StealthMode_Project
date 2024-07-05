// import axios from 'axios';

// const API_URL = 'http://your-api-url-here'; // Replace with your actual API URL

// // Set up axios instance with default settings
// const api = axios.create({
//   baseURL: API_URL,
//   headers: {
//     'Content-Type': 'application/json',
//   },
// });

// // User registration
// export const registerUser = async (userData) => {
//   try {
//     const response = await api.post('/register', userData);
//     return response.data;
//   } catch (error) {
//     throw error.response.data;
//   }
// };

// // User login
// export const loginUser = async (userData) => {
//   try {
//     const response = await api.post('/login', userData);
//     return response.data;
//   } catch (error) {
//     throw error.response.data;
//   }
// };

// // Fetch all courses
// export const getCourses = async () => {
//   try {
//     const response = await api.get('/courses');
//     return response.data;
//   } catch (error) {
//     throw error.response.data;
//   }
// };

// // Enroll in a course
// export const enrollInCourse = async (courseId) => {
//   try {
//     const response = await api.post(`/enroll/${courseId}`);
//     return response.data;
//   } catch (error) {
//     throw error.response.data;
//   }
// };

// // Set authorization token
// export const setAuthToken = (token) => {
//   if (token) {
//     api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
//   } else {
//     delete api.defaults.headers.common['Authorization'];
//   }
// };

// export default api;
