const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Promote an EXISTING user to the admin role, by email.
 *
 *   node scripts/makeAdmin.js user@example.com
 *
 * SAFETY: never creates a user. If no user exists with that email, it reports
 * and exits without making any change. There is no public/API path to do this.
 */
const run = async () => {
  const email = (process.argv[2] || '').toLowerCase().trim();
  if (!email) {
    console.error('Usage: node scripts/makeAdmin.js <email>');
    process.exitCode = 1;
    return;
  }

  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in the environment');
    }
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`No user found with email ${email}. No user was created; no change made.`);
      process.exitCode = 1;
      return;
    }

    if (user.role === 'admin') {
      console.log(`User ${email} is already an admin. No change needed.`);
      return;
    }

    user.role = 'admin';
    await user.save();
    console.log(`User ${email} promoted to admin.`);
  } catch (error) {
    console.error('makeAdmin error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
