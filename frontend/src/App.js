import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './components/home/Home';
import Register from './components/home/Register';
import Login from './components/home/Login';
import Dashboard from './components/home/Dashboard';
import Enroll from './components/home/Enroll';
import Navbar from './components/home/Navbar';
import Profile from './components/home/Profile';
import ForgotPassword from './components/home/ForgotPassword';
import ResetPassword from './components/home/ResetPassword';
import VerifyOtp from './components/home/VerifyOtp';
import AdminRoute from './components/admin/AdminRoute';
import AdminCourses from './components/admin/AdminCourses';
import Cart from './components/home/Cart';
import Wishlist from './components/home/Wishlist';


import { UserProvider } from './context/UserContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { ToastProvider } from './context/ToastContext';
import './styles/tokens.css';
import './App.css';

function App() {
  return (
    <UserProvider>
      <CartProvider>
        <WishlistProvider>
        <ToastProvider>
          <Router>
          <div className="App">
            <Navbar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/verify-otp" element={<VerifyOtp />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/enroll/:id" element={<Enroll />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/profile" element={<Profile />} /> {/* Add this line */}

              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />
              <Route
                path="/admin/courses"
                element={
                  <AdminRoute>
                    <AdminCourses />
                  </AdminRoute>
                }
              />
              </Routes>
            </div>
          </Router>
        </ToastProvider>
        </WishlistProvider>
      </CartProvider>
    </UserProvider>
  );
}

export default App;
