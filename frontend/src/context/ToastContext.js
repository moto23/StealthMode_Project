import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import '../components/css/Toast.css';

const ToastContext = createContext(null);

// Hook used by components to raise non-blocking notifications.
// Safe no-ops if used outside the provider (won't crash a component).
export const useToast = () => {
  const ctx = useContext(ToastContext);
  return ctx || { push: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {}, dismiss: () => {} };
};

const ICONS = { success: '✓', error: '✕', warning: '!', info: 'i' };
let seq = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback(
    (type, message, opts = {}) => {
      if (!message) return null;
      seq += 1;
      const id = seq;
      setToasts((list) => [...list, { id, type, message }]);
      const duration = opts.duration != null ? opts.duration : type === 'error' ? 6000 : 4000;
      if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  const value = {
    push,
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    warning: (m, o) => push('warning', m, o),
    info: (m, o) => push('info', m, o),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="toast-icon" aria-hidden="true">{ICONS[t.type] || 'i'}</span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
