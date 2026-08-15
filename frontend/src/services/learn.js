// Learn/progress API helpers (Phase 7, Slice 2). Thin wrappers over the shared
// axios client — no payment/auth logic here. The server computes all progress
// percentages; the client never sends a percentage.
import api from './api';

export const getLearnData = (courseId) =>
  api.get(`/api/learn/${courseId}`).then((r) => r.data.data);

export const markLessonComplete = (courseId, lessonId, completed = true) =>
  api
    .post(`/api/learn/${courseId}/progress/complete`, { lessonId, completed })
    .then((r) => r.data.data);

export const setCurrentLesson = (courseId, lessonId) =>
  api
    .post(`/api/learn/${courseId}/progress/current`, { lessonId })
    .then((r) => r.data.data);

export const getProgressSummary = () =>
  api.get('/api/learn/progress/summary').then((r) => r.data.progress || {});
