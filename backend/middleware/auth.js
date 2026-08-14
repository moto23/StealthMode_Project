// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify the JWT from the Authorization header and attach the user to req.user.
const protect = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res
        .status(401)
        .json({ success: false, error: 'Not authorized, no token' });
    }

    const token = header.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, error: 'Invalid or expired token' });
    }

    // Load the user fresh so role/verification changes take effect immediately.
    const user = await User.findById(decoded.id).select('-password -otpHash');
    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Auth check failed' });
  }
};

// Restrict a route to one or more roles. Usage: requireRole('admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  if (!roles.includes(req.user.role)) {
    return res
      .status(403)
      .json({ success: false, error: 'Forbidden: insufficient permissions' });
  }
  next();
};

module.exports = { protect, requireRole };
