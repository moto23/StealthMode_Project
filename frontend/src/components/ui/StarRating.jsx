import React, { useState } from 'react';
import { FaStar, FaRegStar } from 'react-icons/fa';

// Reusable 1–5 star rating. Read-only display by default; pass `onChange` to
// make it an interactive, keyboard-accessible selector.
function StarRating({ value = 0, onChange, size = 18, label }) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';
  const shown = hover || value;

  if (!interactive) {
    return (
      <span className="star-rating" role="img" aria-label={label || `${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="star" style={{ fontSize: size }} aria-hidden="true">
            {n <= Math.round(value) ? <FaStar /> : <FaRegStar />}
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="star-rating star-rating-interactive" role="radiogroup" aria-label={label || 'Your rating'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          className="star star-button"
          style={{ fontSize: size }}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
        >
          {n <= shown ? <FaStar /> : <FaRegStar />}
        </button>
      ))}
    </span>
  );
}

export default StarRating;
