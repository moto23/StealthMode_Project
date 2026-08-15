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

// Slice 4: fetch a short-lived Mux signed playback token for one lesson. The
// server authorizes (enrollment / preview) and returns only { playbackId,
// token, expiresIn, ... } — never the Mux asset id or signing key. The token is
// held in component state and refreshed on demand; it is never persisted.
export const getLessonPlayback = (courseId, lessonId) =>
  api
    .get(`/api/learn/${courseId}/lessons/${lessonId}/playback`)
    .then((r) => r.data.data);
