// Admin course-content APIs (Phase 8): Mux Direct Uploads + publishing.
// Thin wrappers over the shared axios client. No Mux credentials ever live here
// — the browser only ever receives an upload URL (to PUT the file straight to
// Mux) and non-secret status metadata.
import api from './api';

export const getManagedCourses = () =>
  api.get('/api/courses/manage').then((r) => r.data.data);

// Ask the backend for a one-time Mux Direct Upload URL (signed playback policy).
export const createVideoUpload = (courseId) =>
  api.post(`/api/courses/${courseId}/video/uploads`).then((r) => r.data.data);

// Poll upload → asset status. Resolves to { status, assetId, playbackId, ... }.
export const getUploadStatus = (courseId, uploadId) =>
  api.get(`/api/courses/${courseId}/video/uploads/${uploadId}`).then((r) => r.data.data);

// Ask Mux to auto-generate captions for a ready asset.
export const requestCaptions = (courseId, assetId, languageCode = 'en') =>
  api
    .post(`/api/courses/${courseId}/video/assets/${assetId}/captions`, { languageCode })
    .then((r) => r.data.data);

export const publishCourse = (courseId) =>
  api.post(`/api/courses/${courseId}/publish`).then((r) => r.data);

export const unpublishCourse = (courseId) =>
  api.post(`/api/courses/${courseId}/unpublish`).then((r) => r.data.data);

// Upload a file DIRECTLY to Mux (never through our backend) via the one-time
// PUT URL, reporting progress. Returns a promise that resolves when the PUT
// completes. `onProgress` receives an integer 0–100.
export const uploadFileToMux = (url, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
