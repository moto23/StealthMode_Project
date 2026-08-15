import React from 'react';
import '../css/ui.css';

// A single course-card placeholder shown while the catalog loads.
export function CardSkeleton() {
  return (
    <div className="sk-card" aria-hidden="true">
      <div className="sk-media sk-shimmer" />
      <div className="sk-body">
        <div className="sk-line sk-shimmer" style={{ width: '40%' }} />
        <div className="sk-line sk-shimmer" style={{ width: '90%', height: 16 }} />
        <div className="sk-line sk-shimmer" style={{ width: '70%' }} />
        <div className="sk-line sk-shimmer" style={{ width: '50%' }} />
        <div className="sk-actions">
          <div className="sk-btn sk-shimmer" />
          <div className="sk-btn sk-shimmer" />
        </div>
      </div>
    </div>
  );
}

export function CardSkeletonGrid({ count = 8 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </>
  );
}

export default CardSkeleton;
