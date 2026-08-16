// Admin auto-seeding API (Phase 8.5). Thin wrapper over the shared axios client.
// The backend generates the curriculum and finds LEGALLY EMBEDDABLE videos; the
// video-source API key stays server-side and never reaches the frontend.
import api from './api';

// mode: 'fill' (default, idempotent — preserves manual lessons + valid videos)
// or 'replace' (full regeneration). Returns { report, curriculum }.
export const autoGenerateCourse = (courseId, mode = 'fill') =>
  api.post(`/api/courses/${courseId}/auto-generate`, { mode }).then((r) => r.data.data);
