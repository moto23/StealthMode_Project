const mongoose = require('mongoose');
require('dotenv').config();

// Cache the connection across serverless invocations (Vercel reuses the
// module scope between warm calls, so we must not open a new connection
// on every request — that is what causes FUNCTION_INVOCATION_FAILED).
let cached = global._mongoose;
if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in the environment');
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000,
      })
      .then((m) => {
        console.log('MongoDB connected');
        return m;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Do not cache a rejected promise, or every subsequent request would
    // await the same failure forever. Clear it so the next call retries.
    cached.promise = null;
    throw err;
  }
  return cached.conn;
};

module.exports = connectDB;
