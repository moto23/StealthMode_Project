import React, { useEffect, useRef, useState } from 'react';
import {
  createVideoUpload,
  getUploadStatus,
  uploadFileToMux,
  requestCaptions,
} from '../../services/adminVideo';

// Per-lesson Mux video: request a Direct Upload URL, upload the file straight to
// Mux (never through our backend), poll processing status, then hand the ready
// video metadata back to the parent via onChange. Also supports replace/remove
// and requesting auto-generated captions. Signed playback is the server default.
function LessonVideoManager({ courseId, video, onChange }) {
  const attached = Boolean(video && video.playbackId);
  const [phase, setPhase] = useState('idle'); // idle | creating | uploading | processing | error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [replacing, setReplacing] = useState(false);

  const fileRef = useRef(null);
  const pollRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const finishWithAsset = (uploadId, data) => {
    onChange({
      provider: 'mux',
      assetId: data.assetId,
      playbackId: data.playbackId,
      uploadId,
      status: data.status, // 'ready'
      policy: data.policy || 'signed',
      duration: data.duration,
      captions: data.captions,
    });
    if (!mountedRef.current) return;
    setPhase('idle');
    setProgress(0);
    setReplacing(false);
    setMessage('Video ready.');
  };

  const pollUntilReady = (uploadId) => {
    stopPolling();
    setPhase('processing');
    setMessage('Processing on Mux…');
    pollRef.current = setInterval(async () => {
      try {
        const data = await getUploadStatus(courseId, uploadId);
        if (!mountedRef.current) return;
        if (data.status === 'ready' && data.playbackId) {
          stopPolling();
          finishWithAsset(uploadId, data);
        } else if (data.status === 'errored') {
          stopPolling();
          setPhase('error');
          setMessage('Mux could not process this video.');
        }
        // else keep polling ('uploading' / 'preparing')
      } catch (err) {
        stopPolling();
        if (!mountedRef.current) return;
        setPhase('error');
        setMessage(err.response?.data?.error || 'Could not check video status.');
      }
    }, 3000);
  };

  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setPhase('error');
      setMessage('Please choose a video file.');
      return;
    }
    try {
      setPhase('creating');
      setMessage('Preparing upload…');
      const { uploadId, url } = await createVideoUpload(courseId);
      setPhase('uploading');
      setProgress(0);
      await uploadFileToMux(url, file, (p) => mountedRef.current && setProgress(p));
      pollUntilReady(uploadId);
    } catch (err) {
      if (!mountedRef.current) return;
      setPhase('error');
      setMessage(err.response?.data?.error || err.message || 'Upload failed.');
    }
  };

  const refreshStatus = async () => {
    if (!video || !video.uploadId) return;
    try {
      setMessage('Refreshing…');
      const data = await getUploadStatus(courseId, video.uploadId);
      if (!mountedRef.current) return;
      onChange({ ...video, status: data.status, playbackId: data.playbackId || video.playbackId, captions: data.captions || video.captions });
      setMessage(data.status === 'ready' ? 'Up to date.' : `Status: ${data.status}`);
    } catch {
      setMessage('Could not refresh status.');
    }
  };

  const generateCaptions = async () => {
    if (!video || !video.assetId) return;
    try {
      setMessage('Requesting captions…');
      const track = await requestCaptions(courseId, video.assetId, 'en');
      if (!mountedRef.current) return;
      const captions = [...(video.captions || []).filter((c) => c.languageCode !== track.languageCode), track];
      onChange({ ...video, captions });
      setMessage('Captions requested — they will appear once Mux finishes.');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not request captions.');
    }
  };

  const removeVideo = () => {
    stopPolling();
    setReplacing(false);
    setPhase('idle');
    setProgress(0);
    setMessage('');
    onChange(undefined);
  };

  const busy = ['creating', 'uploading', 'processing'].includes(phase);
  const readyCaption = (video?.captions || []).find((c) => c.status === 'ready');
  const pendingCaption = (video?.captions || []).find((c) => c.status && c.status !== 'ready');

  return (
    <div className="admin-video-mgr">
      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="admin-video-file"
        onChange={handleFile}
        hidden
      />

      {/* Busy states */}
      {busy && (
        <div className="admin-video-progress">
          <div className="admin-video-progress-head">
            <span>
              {phase === 'creating' && 'Preparing upload…'}
              {phase === 'uploading' && `Uploading to Mux… ${progress}%`}
              {phase === 'processing' && 'Processing on Mux…'}
            </span>
          </div>
          {phase === 'uploading' && (
            <div className="admin-video-bar"><span style={{ width: `${progress}%` }} /></div>
          )}
          {phase === 'processing' && <div className="admin-video-bar indeterminate"><span /></div>}
        </div>
      )}

      {/* Attached & not replacing */}
      {attached && !busy && !replacing && (
        <div className="admin-video-attached">
          <div className="admin-video-row">
            <span className={`admin-video-badge ${video.status === 'ready' ? 'ok' : 'warn'}`}>
              {video.status === 'ready' ? '● Ready' : `● ${video.status || 'attached'}`}
            </span>
            <span className="admin-video-badge policy">{(video.policy || 'signed')} playback</span>
            {readyCaption && <span className="admin-video-badge cc">CC {readyCaption.languageCode}</span>}
            {!readyCaption && pendingCaption && <span className="admin-video-badge warn">CC processing</span>}
          </div>
          <div className="admin-video-actions">
            <button type="button" className="admin-btn admin-btn-small" onClick={() => setReplacing(true)}>Replace</button>
            {video.uploadId && (
              <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={refreshStatus}>Refresh</button>
            )}
            {video.assetId && !readyCaption && (
              <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={generateCaptions}>Generate captions</button>
            )}
            <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={removeVideo}>Remove</button>
          </div>
        </div>
      )}

      {/* Idle / no video, or replacing */}
      {!busy && (!attached || replacing) && (
        <div className="admin-video-upload">
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-primary"
            onClick={() => fileRef.current && fileRef.current.click()}
          >
            {attached ? 'Upload replacement' : 'Upload video'}
          </button>
          {replacing && (
            <button type="button" className="admin-btn admin-btn-small admin-btn-ghost" onClick={() => setReplacing(false)}>Cancel</button>
          )}
          <span className="admin-video-hint">Uploads directly to Mux · signed playback</span>
        </div>
      )}

      {message && <p className={`admin-video-msg${phase === 'error' ? ' error' : ''}`}>{message}</p>}
    </div>
  );
}

export default LessonVideoManager;
