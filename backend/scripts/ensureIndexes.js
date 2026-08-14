const path = require('path');
const mongoose = require('mongoose');
const Enrolled = require('../models/Enrolled');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Safely create the required indexes:
 *  - Enrolled: unique (userId, courseId)
 *  - Payment:  unique (orderId), plus (userId, courseId)
 *  - Order:    unique (orderId), plus (userId)
 *
 * SAFETY: checks for existing duplicates first for each unique index. If any
 * exist, it STOPS for that collection and reports them — it never deletes or
 * modifies data. Only creates the unique index when the data is already unique.
 */
const run = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in the environment');
    }
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

    // ---- Enrolled: unique (userId, courseId) ----
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
    console.log('Enrolled: unique index (userId, courseId) is in place.');
    const eIdx = await Enrolled.collection.indexes();
    console.log('Enrolled indexes:', eIdx.map((i) => i.name).join(', '));
    console.log('Enrollment documents:', await Enrolled.countDocuments(), '(none modified)');

    // ---- Payment: unique (orderId) + (userId, courseId) ----
    const orderDups = await Payment.aggregate([
      { $group: { _id: '$orderId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (orderDups.length > 0) {
      console.error('STOP: duplicate payment orderIds found. Unique index NOT created.');
      orderDups.forEach((d) => console.error(`  orderId=${d._id} count=${d.count}`));
      process.exitCode = 1;
      return;
    }

    await Payment.collection.createIndex({ orderId: 1 }, { unique: true });
    await Payment.collection.createIndex({ userId: 1, courseId: 1 });
    console.log('Payment: unique index (orderId) + (userId, courseId) are in place.');
    const pIdx = await Payment.collection.indexes();
    console.log('Payment indexes:', pIdx.map((i) => i.name).join(', '));
    console.log('Payment documents:', await Payment.countDocuments(), '(none modified)');

    // ---- Order (cart checkout): unique (orderId) + (userId) ----
    const orderOrderDups = await Order.aggregate([
      { $group: { _id: '$orderId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (orderOrderDups.length > 0) {
      console.error('STOP: duplicate order orderIds found. Unique index NOT created.');
      orderOrderDups.forEach((d) => console.error(`  orderId=${d._id} count=${d.count}`));
      process.exitCode = 1;
      return;
    }

    await Order.collection.createIndex({ orderId: 1 }, { unique: true });
    await Order.collection.createIndex({ userId: 1 });
    console.log('Order: unique index (orderId) + (userId) are in place.');
    const oIdx = await Order.collection.indexes();
    console.log('Order indexes:', oIdx.map((i) => i.name).join(', '));
    console.log('Order documents:', await Order.countDocuments(), '(none modified)');
  } catch (error) {
    console.error('ensureIndexes error:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

run();
