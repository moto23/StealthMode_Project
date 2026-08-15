const axios = require('axios');
const ApiError = require('../utils/ApiError');

/**
 * Mux Video REST API wrapper (Phase 8) — asset & Direct Upload management.
 *
 * SECURITY: uses the Mux API access token (MUX_TOKEN_ID / MUX_TOKEN_SECRET) via
 * HTTP Basic auth. These credentials live ONLY here, server-side, and are never
 * returned to the client. Video BINARIES never pass through our backend — the
 * browser uploads directly to the Mux-provided Direct Upload URL.
 *
 * Signing of playback tokens is a SEPARATE concern handled by muxService.js and
 * is intentionally not touched here.
 */

const MUX_API = 'https://api.mux.com';
const MUX_STREAM = 'https://stream.mux.com';

const isConfigured = () => Boolean(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);

const requireConfigured = () => {
  if (!isConfigured()) {
    throw ApiError.serviceUnavailable('Video uploads are not configured');
  }
};

const client = () =>
  axios.create({
    baseURL: MUX_API,
    auth: { username: process.env.MUX_TOKEN_ID, password: process.env.MUX_TOKEN_SECRET },
    timeout: 15000,
  });

// Never leak Mux/credential internals to the client; log server-side only.
const wrapMuxError = (err, fallback) => {
  const status = err.response?.status;
  // eslint-disable-next-line no-console
  console.error('Mux API error:', status, err.response?.data?.error?.messages || err.message);
  if (status === 404) return ApiError.notFound('Video not found on the provider');
  return new ApiError(502, fallback || 'Video provider request failed');
};

// Normalize a Mux asset payload into our lesson.video shape (safe subset).
const normalizeAsset = (asset = {}) => {
  const signed = (asset.playback_ids || []).find((p) => p.policy === 'signed');
  const anyPlayback = signed || (asset.playback_ids || [])[0];
  const captions = (asset.tracks || [])
    .filter((t) => t.type === 'text' && t.text_type === 'subtitles')
    .map((t) => ({
      trackId: t.id,
      languageCode: t.language_code,
      name: t.name,
      status: t.status || (t.text_source ? 'ready' : undefined),
    }));
  return {
    assetId: asset.id,
    status: asset.status, // 'preparing' | 'ready' | 'errored'
    playbackId: anyPlayback ? anyPlayback.id : undefined,
    policy: anyPlayback ? anyPlayback.policy : undefined,
    duration: typeof asset.duration === 'number' ? asset.duration : undefined,
    captions: captions.length ? captions : undefined,
  };
};

/**
 * Create a Mux Direct Upload. New assets DEFAULT TO SIGNED playback policy so
 * course content is protected (never public). Returns the one-time upload URL
 * the browser PUTs the file to, plus the upload id used to poll status.
 */
const createDirectUpload = async ({ corsOrigin = '*' } = {}) => {
  requireConfigured();
  try {
    const res = await client().post('/video/v1/uploads', {
      cors_origin: corsOrigin,
      new_asset_settings: {
        playback_policy: ['signed'], // protected content — never 'public'
      },
    });
    const u = res.data.data;
    return { uploadId: u.id, url: u.url, status: u.status };
  } catch (err) {
    throw wrapMuxError(err, 'Could not start the video upload');
  }
};

/**
 * Resolve a Direct Upload to its current state. While the file is still
 * uploading/processing there is no asset yet; once Mux creates the asset we
 * follow through and return the normalized asset (status + signed playbackId).
 */
const resolveUpload = async (uploadId) => {
  requireConfigured();
  try {
    const res = await client().get(`/video/v1/uploads/${uploadId}`);
    const upload = res.data.data;
    if (!upload.asset_id) {
      // 'waiting' (no file yet) or 'asset_created' pending; 'errored'/'cancelled'.
      const status = upload.status === 'errored' || upload.status === 'cancelled' ? 'errored' : 'uploading';
      return { uploadId, status, assetId: undefined };
    }
    const assetRes = await client().get(`/video/v1/assets/${upload.asset_id}`);
    return { uploadId, ...normalizeAsset(assetRes.data.data) };
  } catch (err) {
    throw wrapMuxError(err, 'Could not check the video status');
  }
};

// Fetch an asset directly (used by the publish gate to re-verify readiness).
const getAsset = async (assetId) => {
  requireConfigured();
  try {
    const res = await client().get(`/video/v1/assets/${assetId}`);
    return normalizeAsset(res.data.data);
  } catch (err) {
    throw wrapMuxError(err, 'Could not read the video asset');
  }
};

/**
 * Ask Mux to auto-generate subtitles/captions for a ready asset.
 * NOTE: the exact tracks payload for generated subtitles should be confirmed
 * against the live Mux API during production validation (this call is isolated
 * and fully mocked in tests). Returns the normalized caption track.
 */
const requestGeneratedCaptions = async (assetId, { languageCode = 'en', name = 'English' } = {}) => {
  requireConfigured();
  try {
    const res = await client().post(`/video/v1/assets/${assetId}/tracks`, {
      type: 'text',
      text_type: 'subtitles',
      text_source: 'generated_vod',
      language_code: languageCode,
      name,
    });
    const t = res.data.data;
    return {
      trackId: t.id,
      languageCode: t.language_code || languageCode,
      name: t.name || name,
      status: t.status || 'preparing',
    };
  } catch (err) {
    throw wrapMuxError(err, 'Could not request captions');
  }
};

/**
 * Fetch the plain-text transcript for a ready caption track. Mux exposes a
 * `.txt` transcript per text track. For SIGNED playback a playback token is
 * required (passed in by the caller, which mints it via muxService). Returns the
 * transcript text EXACTLY as Mux provides it — never fabricated.
 */
const getTranscriptText = async (playbackId, trackId, token) => {
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `${MUX_STREAM}/${playbackId}/text/${trackId}.txt${qs}`;
  try {
    const res = await axios.get(url, { timeout: 15000, responseType: 'text' });
    return typeof res.data === 'string' ? res.data : String(res.data || '');
  } catch (err) {
    throw wrapMuxError(err, 'Could not load the transcript');
  }
};

module.exports = {
  isConfigured,
  createDirectUpload,
  resolveUpload,
  getAsset,
  requestGeneratedCaptions,
  getTranscriptText,
  normalizeAsset,
};
