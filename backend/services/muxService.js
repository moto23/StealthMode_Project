const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

/**
 * Mux signed-playback token generation (Phase 7, Slice 4).
 *
 * SECURITY MODEL
 *  - The Mux signing key (id + RSA private key) lives ONLY on the server, in
 *    environment variables. It is never sent to the browser or logged.
 *  - For a lesson with a SIGNED playback policy, the browser cannot stream from
 *    Mux without a short-lived JWT signed by this private key. We mint that JWT
 *    here, only after the caller has passed authentication + enrollment/preview
 *    authorization (see learnService.getLessonPlayback).
 *  - The Mux ASSET id is server-side metadata and is never returned. Only the
 *    playbackId (useless without a valid signed token) + the token reach the
 *    client.
 *
 * We sign the JWT with the existing `jsonwebtoken` dependency (RS256) rather
 * than pulling in the Mux SDK — the token shape Mux requires is:
 *   header:  { alg: 'RS256', kid: <signing key id> }
 *   payload: { sub: <playbackId>, aud: 'v', exp: <unix ts> }
 */

// aud claim per Mux: 'v' video, 't' thumbnail, 'g' animated gif, 's' storyboard.
const AUDIENCE = { video: 'v', thumbnail: 't', gif: 'g', storyboard: 's' };

// Floor / fallback token lifetime (also used when a lesson's duration is
// unknown or unparseable). Configurable via MUX_TOKEN_EXPIRY_SECONDS.
const DEFAULT_TTL_SECONDS = 3600; // 1 hour.

// Mux guidance: a playback token must stay valid for the ENTIRE watch — the
// token rides in the HLS manifest + segment URLs, so if it expires mid-stream
// the next segment request 403s and playback stalls. We therefore make the
// token outlive the content: exp >= now + duration + this cushion (covers
// pauses, seeks, and rebuffering). The client still refreshes as a backstop.
const EXP_BUFFER_SECONDS = 1800; // 30 min.

const isConfigured = () =>
  Boolean(process.env.MUX_SIGNING_KEY_ID && process.env.MUX_SIGNING_KEY_PRIVATE_KEY);

// Mux hands out the signing private key base64-encoded. Accept that (default)
// or a raw PEM (with literal or escaped newlines) for flexibility.
const getPrivateKeyPem = () => {
  const raw = process.env.MUX_SIGNING_KEY_PRIVATE_KEY || '';
  if (raw.includes('BEGIN')) return raw.replace(/\\n/g, '\n');
  return Buffer.from(raw, 'base64').toString('utf8');
};

const getFloorTtlSeconds = () => {
  const n = parseInt(process.env.MUX_TOKEN_EXPIRY_SECONDS, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_SECONDS;
};

// Best-effort parse of a lesson's free-form `duration` display string into
// seconds. Handles "mm:ss" / "hh:mm:ss" and unit forms ("90 min", "1.5 hours",
// "45 sec", "2h 5m"). Returns null when it cannot be interpreted.
const parseDurationSeconds = (input) => {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) && input > 0 ? Math.ceil(input) : null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;

  // Clock form: hh:mm:ss or mm:ss.
  if (/^\d{1,3}:\d{2}(:\d{2})?$/.test(s)) {
    const secs = s.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
    return secs > 0 ? secs : null;
  }

  // Unit form: any combination of hours / minutes / seconds.
  let total = 0;
  let matched = false;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
  const m = s.match(/(\d+(?:\.\d+)?)\s*(m|min|mins|minute|minutes)\b/);
  const sec = s.match(/(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds)\b/);
  if (h) { total += parseFloat(h[1]) * 3600; matched = true; }
  if (m) { total += parseFloat(m[1]) * 60; matched = true; }
  if (sec) { total += parseFloat(sec[1]); matched = true; }
  return matched && total > 0 ? Math.ceil(total) : null;
};

// Token lifetime for a lesson: never shorter than the configured floor, and
// always long enough to cover the content plus a cushion when the duration is
// known. This is the clean implementation of Mux's exp > now + duration rule.
const ttlForContent = (durationInput) => {
  const floor = getFloorTtlSeconds();
  const dur = parseDurationSeconds(durationInput);
  if (dur == null) return floor;
  return Math.max(floor, dur + EXP_BUFFER_SECONDS);
};

/**
 * Mint a signed playback token for a given playbackId.
 * @param {string} playbackId  Mux signed playback id (safe to expose).
 * @param {object} [opts]
 * @param {'video'|'thumbnail'|'gif'|'storyboard'} [opts.type='video']
 * @param {string|number} [opts.contentDuration]  Lesson duration (display
 *        string or seconds) — the token is sized to outlive it.
 * @param {number} [opts.ttlSeconds]  Explicit override (wins over duration).
 * @returns {{ token: string, expiresIn: number }}
 */
const signPlaybackToken = (playbackId, { type = 'video', contentDuration, ttlSeconds } = {}) => {
  if (!playbackId) {
    // Caller should have guarded this; defensive.
    throw ApiError.notFound('This lesson has no video yet');
  }
  if (!isConfigured()) {
    throw ApiError.serviceUnavailable('Video playback is not configured');
  }
  const expiresIn = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : ttlForContent(contentDuration);
  const token = jwt.sign({}, getPrivateKeyPem(), {
    algorithm: 'RS256',
    keyid: process.env.MUX_SIGNING_KEY_ID,
    subject: String(playbackId),
    audience: AUDIENCE[type] || AUDIENCE.video,
    expiresIn,
  });
  return { token, expiresIn };
};

module.exports = {
  signPlaybackToken,
  isConfigured,
  parseDurationSeconds,
  ttlForContent,
  AUDIENCE,
  DEFAULT_TTL_SECONDS,
};
