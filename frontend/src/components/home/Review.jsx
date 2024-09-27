// src/components/Review.js
import React, { useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { UserContext } from '../../context/UserContext';
import '../css/Review.css';

function Review({ courseId }) {
  const [reviews, setReviews] = useState([]);
  const [reviewText, setReviewText] = useState('');
  const [rating, setRating] = useState(0);
  const { user } = useContext(UserContext);

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await axios.get(`https://sleath-backend.vercel.app/api/courses/${courseId}/reviews`);
        setReviews(response.data);
      } catch (error) {
        console.error('Error fetching reviews:', error);
      }
    };

    fetchReviews();
  }, [courseId]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      alert('Please register or log in to submit a review.');
      return;
    }

    try {
      const response = await axios.post(`https://sleath-backend.vercel.app/api/courses/${courseId}/reviews`, {
        userId: user._id,
        userName: user.fullName,
        userEmail: user.email,
        reviewText,
        rating,
      });
      setReviews([...reviews, response.data]);
      setReviewText('');
      setRating(0);
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  };

  return (
    <div className="review-section">
      <h2>Reviews</h2>
      <form onSubmit={handleReviewSubmit} className="review-form">
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Write your review here..."
          required
        ></textarea>
        <select value={rating} onChange={(e) => setRating(e.target.value)} required>
          <option value="">Rate the course</option>
          {[1, 2, 3, 4, 5].map((rate) => (
            <option key={rate} value={rate}>{rate} Star{rate > 1 ? 's' : ''}</option>
          ))}
        </select>
        <button type="submit">Submit Review</button>
      </form>
      <div className="reviews-list">
        {reviews.map((review, index) => (
          <div key={index} className="review">
            <h3>{review.userName} ({review.rating} Stars)</h3>
            <p>{review.reviewText}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Review;
