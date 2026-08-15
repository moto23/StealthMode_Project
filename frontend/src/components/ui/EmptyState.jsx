import React from 'react';
import '../css/ui.css';

// Friendly empty state (no results, empty cart, no enrollments, etc.).
export default function EmptyState({ icon = '🔍', title, message, action }) {
  return (
    <div className="ui-state">
      <div className="ui-state-icon" aria-hidden="true">{icon}</div>
      {title && <h3 className="ui-state-title">{title}</h3>}
      {message && <p className="ui-state-msg">{message}</p>}
      {action && <div className="ui-state-action">{action}</div>}
    </div>
  );
}
