const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const authRouter = require('./routes/auth');
const coursesRouter = require('./routes/courses');

const app = express();

// ---- CORS ----
// Allow the real production frontend plus local development.
const allowedOrigins = [
  process.env.FRONTEND_URL || 'https://stealthmode-frontend.vercel.app',
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser tools (curl/Postman) that send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.use(express.json());

// ---- Health check ----
// MUST return 200 without touching MongoDB or Resend. Reports only whether
// config is PRESENT (booleans) — never any secret value — to help diagnose
// Vercel env wiring. Not mounted behind the DB gate.
const health = (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    service: 'StealthMode API',
    time: new Date().toISOString(),
    config: {
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      jwtConfigured: Boolean(process.env.JWT_SECRET),
      resendConfigured: Boolean(process.env.RESEND_API_KEY),
      resendFromConfigured: Boolean(process.env.RESEND_FROM_EMAIL),
      frontendUrl: process.env.FRONTEND_URL || null,
      otpExpiryMinutes: process.env.OTP_EXPIRY_MINUTES || null,
    },
  });
};

app.get('/', health);
app.get('/api/health', health);

// Ensure a live DB connection before handling API requests (serverless-safe).
const ensureDb = async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(503).json({ success: false, error: 'Database unavailable' });
  }
};

// ---- Routes ----
app.use('/api/auth', ensureDb, authRouter);
app.use('/api/courses', ensureDb, coursesRouter);

// ---- 404 for unknown API routes ----
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ---- Central error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Normalize common Mongoose/Mongo errors to clean client responses.
  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate resource';
  }

  // Never leak internal details on unexpected 500s.
  if (status >= 500) {
    console.error('Unhandled error:', err.message);
    message = 'Internal server error';
  }

  res.status(status).json({ success: false, error: message });
});

// Only listen when run directly (local dev). On Vercel the app is exported
// and invoked as a serverless function.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;
