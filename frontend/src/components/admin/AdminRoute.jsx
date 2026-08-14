import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { UserContext } from '../../context/UserContext';

// Route guard for admin-only pages. The backend (protect + requireRole('admin'))
// remains the authoritative security layer; this only controls UI access.
function AdminRoute({ children }) {
  const { user, loading } = useContext(UserContext);

  if (loading) {
    return <div className="admin-loading">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default AdminRoute;
