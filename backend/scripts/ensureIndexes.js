const path = require('path');
const mongoose = require('mongoose');
const Enrolled = require('../models/Enrolled');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Safely create the (userId, courseId) unique index on `enrolleds`.
 *
 * SAFETY: checks for existing duplicate enrollment pairs first. If any exist,
 * it STOPS and reports them — it never deletes or modifies enrollment data.
 * Only creates the index when the data is already unique.
 */
const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in the environment');
    }
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    // Find any duplicate (userId, courseId) pairs.
    const dups = await Enrolled.aggregate([
      { $group: { _id: { userId: '$userId', courseId: '$courseId' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (dups.length > 0) {
      console.error('STOP: duplicate enrollment records found. Index NOT created.');
      console.error('Resolve these manually before creating the unique index:');
      dups.forEach((d) =>
        console.error(`  userId=${d._id.userId} courseId=${d._id.courseId} count=${d.count}`)
      );
      process.exitCode = 1;
      return;
    }

    await Enrolled.collection.createIndex({ userId: 1, courseId: 1 }, { unique: true });
    console.log('Unique index (userId, courseId) is in place.');

    const indexes = await Enrolled.collection.indexes();
    console.log('Current indexes:', indexes.map((i) => i.name).join(', '));
    const total = await Enrolled.countDocuments();
    console.log('Enrollment documents:', total, '(none modified)');
  } catch (error) {
    console.error('ensureIndexes error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
