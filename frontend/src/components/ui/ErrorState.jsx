import React from 'react';
import '../css/ui.css';

// User-friendly, retryable error state. Real errors are still logged to the
// console by callers; this surfaces them to the user instead of hiding them.
export default function ErrorState({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className="ui-state ui-state-error" role="alert">
      <div className="ui-state-icon" aria-hidden="true">⚠️</div>
      <h3 className="ui-state-title">{title}</h3>
      {message && <p className="ui-state-msg">{message}</p>}
      {onRetry && (
        <div className="ui-state-action">
          <button type="button" className="sm-btn sm-btn-primary" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
