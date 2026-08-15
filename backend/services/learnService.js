const Course = require('../models/Course');
const Enrolled = require('../models/Enrolled');
const Progress = require('../models/Progress');
const ApiError = require('../utils/ApiError');
const { assertValidObjectId } = require('../utils/validate');

const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);

// Authoritative access gate: a user may learn a course only if they have an
// Enrolled record (free enrollment OR verified paid purchase both create one).
const assertEnrolled = async (userId, courseId) => {
  const enrolled = await Enrolled.exists({ userId, courseId });
  if (!enrolled) {
    throw ApiError.forbidden('You must be enrolled in this course to access it');
  }
};

// Flatten a course's lessons in curriculum order; strip protected video handles
// for non-preview lessons (video playback is a later slice — never leak ids).
const buildCurriculum = (course) => {
  const sections = Array.isArray(course.sections) ? [...course.sections].sort(byOrder) : [];
  return sections.map((s) => ({
    _id: s._id,
    title: s.title,
    lessons: (Array.isArray(s.lessons) ? [...s.lessons].sort(byOrder) : []).map((l) => ({
      _id: l._id,
      title: l.title,
      duration: l.duration,
      isPreview: Boolean(l.isPreview),
    })),
  }));
};

const validLessonIdSet = (course) => {
  const set = new Set();
  (course.sections || []).forEach((s) =>
    (s.lessons || []).forEach((l) => set.add(String(l._id)))
  );
  return set;
};

// Percentage is ALWAYS derived server-side: completed ∩ real-lessons / total.
const computePercent = (completedIds, validSet) => {
  const total = validSet.size;
  if (total === 0) return 0;
  const done = completedIds.filter((id) => validSet.has(String(id))).length;
  return Math.round((done / total) * 100);
};

const findOrInitProgress = async (userId, courseId) => {
  const existing = await Progress.findOne({ userId, courseId });
  return existing || new Progress({ userId, courseId, completedLessonIds: [] });
};

// Full learn payload for an enrolled user: curriculum + their progress + resume.
const getLearnData = async (userId, courseId) => {
  assertValidObjectId(courseId, 'course id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  const validSet = validLessonIdSet(course);
  const progress = await Progress.findOne({ userId, courseId });
  const completed = progress ? progress.completedLessonIds.map(String) : [];

  return {
    courseId: String(course._id),
    title: course.title,
    sections: buildCurriculum(course),
    completedLessonIds: completed.filter((id) => validSet.has(id)),
    currentLessonId: progress && progress.currentLessonId ? String(progress.currentLessonId) : null,
    totalLessons: validSet.size,
    percent: computePercent(completed, validSet),
  };
};

// Mark a lesson complete (default) or incomplete. Validates the lesson belongs
// to the course; $addToSet guarantees no double-counting.
const setLessonComplete = async (userId, courseId, lessonId, completed = true) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  const validSet = validLessonIdSet(course);
  if (!validSet.has(String(lessonId))) {
    throw ApiError.badRequest('Lesson does not belong to this course');
  }

  const progress = await findOrInitProgress(userId, courseId);
  const has = progress.completedLessonIds.some((id) => String(id) === String(lessonId));
  if (completed && !has) {
    progress.completedLessonIds.push(lessonId);
  } else if (!completed && has) {
    progress.completedLessonIds = progress.completedLessonIds.filter(
      (id) => String(id) !== String(lessonId)
    );
  }
  await progress.save();

  const completedIds = progress.completedLessonIds.map(String);
  return {
    completedLessonIds: completedIds,
    percent: computePercent(completedIds, validSet),
    totalLessons: validSet.size,
  };
};

// Persist the resume point (current lesson).
const setCurrentLesson = async (userId, courseId, lessonId) => {
  assertValidObjectId(courseId, 'course id');
  assertValidObjectId(lessonId, 'lesson id');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');
  await assertEnrolled(userId, courseId);

  if (!validLessonIdSet(course).has(String(lessonId))) {
    throw ApiError.badRequest('Lesson does not belong to this course');
  }

  const progress = await findOrInitProgress(userId, courseId);
  progress.currentLessonId = lessonId;
  await progress.save();
  return { currentLessonId: String(lessonId) };
};

// Progress summary for My Learning: { [courseId]: percent } across the user's
// enrolled courses. Percentages computed server-side from real lessons.
const getProgressSummary = async (userId) => {
  const enrollments = await Enrolled.find({ userId }).select('courseId').lean();
  const courseIds = enrollments.map((e) => e.courseId).filter(Boolean);
  if (courseIds.length === 0) return { progress: {} };

  const [courses, progresses] = await Promise.all([
    Course.find({ _id: { $in: courseIds } }).select('sections').lean(),
    Progress.find({ userId, courseId: { $in: courseIds } }).lean(),
  ]);

  const progressByCourse = new Map(progresses.map((p) => [String(p.courseId), p]));
  const result = {};
  courses.forEach((course) => {
    const validSet = new Set();
    (course.sections || []).forEach((s) =>
      (s.lessons || []).forEach((l) => validSet.add(String(l._id)))
    );
    const p = progressByCourse.get(String(course._id));
    const completed = p ? p.completedLessonIds.map(String) : [];
    result[String(course._id)] = computePercent(completed, validSet);
  });
  return { progress: result };
};

module.exports = {
  getLearnData,
  setLessonComplete,
  setCurrentLesson,
  getProgressSummary,
};
