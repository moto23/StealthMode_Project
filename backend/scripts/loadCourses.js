const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Course = require('../models/Course');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Idempotent course seeder.
 *
 * - Upserts each course by its stable `slug` (never blind insertMany), so
 *   running this repeatedly updates in place and NEVER creates duplicates.
 * - Only touches the `courses` collection. Does not delete or modify users,
 *   enrollments, or any other collection, and never drops the database.
 */
const loadCourses = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in the environment');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
    });

    const data = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../data/courses.json'), 'utf-8')
    );

    // Guard: the seed file itself must not contain duplicate slugs.
    const slugs = data.map((c) => c.slug);
    const dupInFile = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupInFile.length) {
      throw new Error(`Duplicate slugs in courses.json: ${[...new Set(dupInFile)].join(', ')}`);
    }

    const ops = data.map((course) => ({
      updateOne: {
        filter: { slug: course.slug },
        update: { $set: course },
        upsert: true,
      },
    }));

    const result = await Course.bulkWrite(ops, { ordered: false });

    const total = await Course.countDocuments();
    const distinctSlugs = (await Course.distinct('slug')).length;
    const distinctTitles = (await Course.distinct('title')).length;

    console.log('--- Seed complete ---');
    console.log('Upserted (new):   ', result.upsertedCount);
    console.log('Matched (updated):', result.matchedCount);
    console.log('Modified:         ', result.modifiedCount);
    console.log('Total course docs:', total);
    console.log('Distinct slugs:   ', distinctSlugs);
    console.log('Distinct titles:  ', distinctTitles);
    console.log(
      total === distinctSlugs && total === distinctTitles
        ? 'No duplicates: OK'
        : 'WARNING: duplicate slugs or titles detected'
    );
  } catch (error) {
    console.error('Error loading courses:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

loadCourses();
