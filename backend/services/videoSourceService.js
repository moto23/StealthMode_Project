const axios = require('axios');

/**
 * Phase 8.5 — approved external video source provider.
 *
 * LEGAL / EMBEDDING POLICY
 *  - We NEVER download, rehost, or copy third-party video. We only reference
 *    videos the owner has marked EMBEDDABLE and play them via the provider's
 *    official iframe embed.
 *  - Provider: YouTube Data API v3, filtered to `videoEmbeddable=true` and
 *    (by default) Creative Commons license. Only candidates whose
 *    `status.embeddable === true` are returned.
 *  - The API key is server-side only (YOUTUBE_API_KEY) and never reaches the
 *    frontend. When unconfigured, search returns [] (the feature degrades: the
 *    curriculum is still generated but lessons are flagged as missing a video).
 *
 * All returned metadata is REAL provider data — titles, durations, and ids are
 * taken verbatim from the API and never invented.
 */

const YT_API = 'https://www.googleapis.com/youtube/v3';

const isConfigured = () => Boolean(process.env.YOUTUBE_API_KEY);

// Parse an ISO-8601 duration (e.g. "PT8M24S") into whole seconds. Returns null
// when unparseable.
const parseISO8601Duration = (iso) => {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, h, min, s] = m;
  const total = (Number(h) || 0) * 3600 + (Number(min) || 0) * 60 + (Number(s) || 0);
  return total > 0 ? total : null;
};

const embedUrlFor = (videoId) => `https://www.youtube-nocookie.com/embed/${videoId}`;
const watchUrlFor = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

// Simple relevance score: overlap between query terms and the candidate's
// title/channel, with a small bonus for Creative Commons.
const scoreCandidate = (query, cand) => {
  const terms = String(query).toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const hay = `${cand.sourceTitle || ''} ${cand.channelTitle || ''}`.toLowerCase();
  let score = 0;
  terms.forEach((t) => {
    if (hay.includes(t)) score += 1;
  });
  if (cand.license === 'creativeCommon') score += 1.5;
  if (cand.duration && cand.duration >= 120 && cand.duration <= 3600) score += 0.5; // reasonable lesson length
  return score;
};

/**
 * Search for legally embeddable candidate videos for a query.
 * @returns {Promise<Array>} ranked candidates:
 *   [{ provider:'youtube', sourceId, url, embedUrl, sourceTitle, channelTitle,
 *      duration, embeddable:true, license }]
 * Never throws — on any provider/network error it resolves to [].
 */
const searchEmbeddable = async (query, { max = 5, preferCreativeCommon = true } = {}) => {
  if (!isConfigured() || !query) return [];
  const key = process.env.YOUTUBE_API_KEY;
  try {
    const searchParams = {
      key,
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      maxResults: Math.min(Math.max(max, 1), 10),
      q: query,
    };
    if (preferCreativeCommon) searchParams.videoLicense = 'creativeCommon';

    const search = await axios.get(`${YT_API}/search`, { params: searchParams, timeout: 15000 });
    const ids = (search.data.items || [])
      .map((it) => it.id && it.id.videoId)
      .filter(Boolean);
    if (ids.length === 0) return [];

    const details = await axios.get(`${YT_API}/videos`, {
      params: { key, part: 'contentDetails,status,snippet', id: ids.join(',') },
      timeout: 15000,
    });

    const candidates = (details.data.items || [])
      .filter((v) => v.status && v.status.embeddable === true) // hard requirement
      .map((v) => ({
        provider: 'youtube',
        sourceId: v.id,
        url: watchUrlFor(v.id),
        embedUrl: embedUrlFor(v.id),
        sourceTitle: v.snippet ? v.snippet.title : undefined,
        channelTitle: v.snippet ? v.snippet.channelTitle : undefined,
        duration: parseISO8601Duration(v.contentDetails && v.contentDetails.duration),
        embeddable: true,
        license: v.status ? v.status.license : undefined,
      }));

    return candidates.sort((a, b) => scoreCandidate(query, b) - scoreCandidate(query, a));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('videoSourceService search error:', err.response?.status || err.message);
    return [];
  }
};

// Best single embeddable candidate for a query, or null.
const pickBest = async (query, opts) => {
  const list = await searchEmbeddable(query, opts);
  return list.length ? list[0] : null;
};

module.exports = {
  isConfigured,
  searchEmbeddable,
  pickBest,
  parseISO8601Duration,
  scoreCandidate,
};
