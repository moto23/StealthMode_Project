import React, { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import { getReviews, getMyReview, upsertReview, deleteReview } from '../../services/reviews';
import StarRating from '../ui/StarRating';

// Reviews & ratings for a course (Phase 7, Slice 3). Averages/counts come from
// the server (real reviews only). The write form is shown only to enrolled
// users (canReview); everyone can read.
function CourseReviews({ courseId, canReview }) {
  const toast = useToast();
  const [reviews, setReviews] = useState([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [myReview, setMyReview] = useState(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getReviews(courseId);
      setReviews(data.reviews || []);
      setAverage(data.average || 0);
      setCount(data.count || 0);
    } catch (e) {
      /* non-fatal — reviews are supplementary */
    }
  }, [courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    if (!canReview) {
      setMyReview(null);
      return undefined;
    }
    getMyReview(courseId)
      .then((mine) => {
        if (!active) return;
        setMyReview(mine);
        if (mine) {
          setRating(mine.rating);
          setComment(mine.comment || '');
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [courseId, canReview]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    if (rating < 1 || rating > 5) {
      toast.error('Please choose a rating from 1 to 5 stars.');
      return;
    }
    setSubmitting(true);
    try {
      const saved = await upsertReview(courseId, { rating, comment });
      setMyReview(saved);
      toast.success(myReview ? 'Your review was updated.' : 'Thanks for your review!');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save your review.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteReview(courseId);
      setMyReview(null);
      setRating(0);
      setComment('');
      toast.success('Your review was removed.');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete your review.');
    }
  };

  const fmtDate = (d) => {
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return '';
    }
  };

  return (
    <section className="cd-reviews" aria-labelledby="cd-reviews-heading">
      <h2 id="cd-reviews-heading">Student reviews</h2>

      <div className="cd-reviews-summary">
        {count > 0 ? (
          <>
            <span className="cd-reviews-avg">{average.toFixed(1)}</span>
            <StarRating value={average} label={`Average rating ${average.toFixed(1)} out of 5`} />
            <span className="cd-reviews-count">
              {count} {count === 1 ? 'review' : 'reviews'}
            </span>
          </>
        ) : (
          <span className="cd-reviews-count">No reviews yet.</span>
        )}
      </div>

      {canReview ? (
        <form className="cd-review-form" onSubmit={handleSubmit}>
          <h3>{myReview ? 'Edit your review' : 'Write a review'}</h3>
          <StarRating value={rating} onChange={setRating} size={24} label="Your rating" />
          <textarea
            className="cd-review-textarea"
            placeholder="Share what you thought about this course (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
          />
          <div className="cd-review-actions">
            <button type="submit" className="sm-btn sm-btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : myReview ? 'Update review' : 'Submit review'}
            </button>
            {myReview && (
              <button type="button" className="sm-btn sm-btn-outline" onClick={handleDelete}>
                Delete
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="cd-reviews-note">Enroll in this course to leave a review.</p>
      )}

      {reviews.length > 0 && (
        <ul className="cd-review-list">
          {reviews.map((r) => (
            <li key={r._id} className="cd-review-item">
              <div className="cd-review-item-head">
                <span className="cd-review-author">{r.userFullName}</span>
                <StarRating value={r.rating} size={14} label={`${r.rating} out of 5 stars`} />
                <span className="cd-review-date">{fmtDate(r.updatedAt || r.createdAt)}</span>
              </div>
              {r.comment && <p className="cd-review-comment">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CourseReviews;
