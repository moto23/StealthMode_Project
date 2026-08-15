// Review/rating API helpers (Phase 7, Slice 3). Thin wrappers over the shared
// axios client. Averages/counts come from the server (real reviews only).
import api from './api';

export const getReviews = (courseId) =>
  api.get(`/api/courses/${courseId}/reviews`).then((r) => r.data);

export const getMyReview = (courseId) =>
  api.get(`/api/courses/${courseId}/reviews/me`).then((r) => r.data.review);

export const upsertReview = (courseId, { rating, comment }) =>
  api.post(`/api/courses/${courseId}/reviews`, { rating, comment }).then((r) => r.data.review);

export const deleteReview = (courseId) =>
  api.delete(`/api/courses/${courseId}/reviews/me`).then((r) => r.data);
