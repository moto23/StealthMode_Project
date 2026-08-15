import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaPlay, FaLock, FaRedo } from 'react-icons/fa';
import { getLessonPlayback } from '../../services/learn';

// Mux Player web component, loaded lazily from CDN so we don't bundle a heavy
// player dependency. It registers the <mux-player> custom element globally.
const MUX_PLAYER_CDN = 'https://cdn.jsdelivr.net/npm/@mux/mux-player@3';

let muxLoaderPromise = null;
const loadMuxPlayer = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.customElements && window.customElements.get('mux-player')) {
    return Promise.resolve();
  }
  if (!muxLoaderPromise) {
    muxLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MUX_PLAYER_CDN;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => {
        muxLoaderPromise = null;
        reject(new Error('Failed to load the video player'));
      };
      document.head.appendChild(script);
    });
  }
  return muxLoaderPromise;
};

// Refresh the signed token this many seconds BEFORE it actually expires, so
// playback never hits an expired token mid-stream.
const REFRESH_SKEW_SECONDS = 60;

/**
 * Protected Mux video for a single lesson.
 *  - Fetches a short-lived signed playback token from the server (never stored).
 *  - Auto-refreshes the token shortly before it expires, and on a player auth
 *    error, without restarting the whole lesson.
 *  - States: loading, ready (player), novideo, locked (403), error (+retry).
 */
function LessonPlayer({ courseId, lessonId, title }) {
  const playerRef = useRef(null);
  const refreshTimer = useRef(null);
  const refreshingRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | ready | novideo | locked | error
  const [playback, setPlayback] = useState(null); // { playbackId, token, expiresIn }
  const [playerReady, setPlayerReady] = useState(false);

  // Load the player script once.
  useEffect(() => {
    let active = true;
    loadMuxPlayer()
      .then(() => active && setPlayerReady(true))
      .catch(() => active && setStatus('error'));
    return () => {
      active = false;
    };
  }, []);

  const clearRefresh = () => {
    if (refreshTimer.current) {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  };

  // Fetch (or refetch) a token for the current lesson. `silent` keeps the
  // existing player mounted during a background refresh.
  const fetchToken = useCallback(
    async (silent = false) => {
      if (!courseId || !lessonId) return;
      if (!silent) setStatus('loading');
      try {
        const data = await getLessonPlayback(courseId, lessonId);
        setPlayback({ playbackId: data.playbackId, token: data.token, expiresIn: data.expiresIn });
        setStatus('ready');
        // Schedule the next refresh from the token's own lifetime.
        clearRefresh();
        const ttl = Number(data.expiresIn) || 3600;
        const delayMs = Math.max(ttl - REFRESH_SKEW_SECONDS, 15) * 1000;
        refreshTimer.current = setTimeout(() => {
          refreshingRef.current = true;
          fetchToken(true).finally(() => {
            refreshingRef.current = false;
          });
        }, delayMs);
      } catch (err) {
        const code = err.response?.status;
        if (code === 404) setStatus('novideo');
        else if (code === 403) setStatus('locked');
        else setStatus('error');
      }
    },
    [courseId, lessonId]
  );

  // Re-fetch whenever the lesson changes; clean up the timer on unmount.
  useEffect(() => {
    setPlayback(null);
    fetchToken(false);
    return clearRefresh;
  }, [fetchToken]);

  // Push playback-id / token onto the custom element imperatively (avoids
  // passing unknown props through JSX). Updating only the token attribute
  // refreshes credentials without tearing down the player.
  useEffect(() => {
    const el = playerRef.current;
    if (!el || status !== 'ready' || !playback) return;
    el.setAttribute('playback-id', playback.playbackId);
    el.setAttribute('playback-token', playback.token);
    el.setAttribute('stream-type', 'on-demand');
    if (title) el.setAttribute('metadata-video-title', title);

    const onError = () => {
      // A player error is often an expired/invalid token — try one refresh.
      if (!refreshingRef.current) {
        refreshingRef.current = true;
        fetchToken(true).finally(() => {
          refreshingRef.current = false;
        });
      }
    };
    el.addEventListener('error', onError);
    return () => el.removeEventListener('error', onError);
  }, [status, playback, playerReady, title, fetchToken]);

  if (status === 'loading') {
    return (
      <div className="learn-video learn-video-state" role="status" aria-live="polite">
        <div className="learn-video-inner">
          <span className="learn-video-spinner" aria-hidden="true" />
          <p>Preparing secure video…</p>
        </div>
      </div>
    );
  }

  if (status === 'novideo') {
    return (
      <div className="learn-video learn-video-state" role="img" aria-label="No video yet">
        <div className="learn-video-inner">
          <FaPlay aria-hidden="true" />
          <p>Video for this lesson is coming soon.</p>
        </div>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div className="learn-video learn-video-state" role="img" aria-label="Locked lesson">
        <div className="learn-video-inner">
          <FaLock aria-hidden="true" />
          <p>Enroll in this course to watch this lesson.</p>
        </div>
      </div>
    );
  }

  if (status === 'error' || !playerReady) {
    return (
      <div className="learn-video learn-video-state" role="alert">
        <div className="learn-video-inner">
          <p>We couldn’t start this video.</p>
          <button
            type="button"
            className="sm-btn sm-btn-outline"
            onClick={() => {
              setPlayerReady(false);
              loadMuxPlayer()
                .then(() => setPlayerReady(true))
                .catch(() => setStatus('error'));
              fetchToken(false);
            }}
          >
            <FaRedo aria-hidden="true" /> Try again
          </button>
        </div>
      </div>
    );
  }

  // status === 'ready' && playerReady. Key by playbackId so a new lesson gets a
  // fresh element; token-only refreshes reuse it.
  return (
    <div className="learn-video learn-video-live">
      {React.createElement('mux-player', {
        key: playback.playbackId,
        ref: playerRef,
        'stream-type': 'on-demand',
        style: { width: '100%', height: '100%', display: 'block' },
      })}
    </div>
  );
}

export default LessonPlayer;
