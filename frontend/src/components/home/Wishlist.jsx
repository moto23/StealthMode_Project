import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { UserContext } from '../../context/UserContext';
import { useWishlist } from '../../context/WishlistContext';
import CourseCard from './CourseCard';
import EmptyState from '../ui/EmptyState';
import '../css/Wishlist.css';

function Wishlist() {
  const { user } = useContext(UserContext);
  const { items, count, clearWishlist } = useWishlist();
  const [owned, setOwned] = useState(() => new Set());

  // Authoritative ownership from the backend — same read the Dashboard uses.
  // Wishlist itself stays localStorage-only; this is display state only.
  useEffect(() => {
    let active = true;
    if (!user) {
      setOwned(new Set());
      return undefined;
    }
    api
      .get('/api/payments/owned')
      .then((res) => active && setOwned(new Set((res.data.courseIds || []).map(String))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user]);

  if (count === 0) {
    return (
      <div className="wishlist-page">
        <EmptyState
          icon="❤️"
          title="Your wishlist is empty"
          message="Tap the heart on any course to save it here for later."
          action={<Link to="/dashboard" className="sm-btn sm-btn-primary">Browse Courses</Link>}
        />
      </div>
    );
  }

  return (
    <div className="wishlist-page">
      <div className="wishlist-header">
        <div>
          <h1>My Wishlist</h1>
          <span className="wishlist-count">{count} {count === 1 ? 'course' : 'courses'} saved</span>
        </div>
        <button type="button" className="wishlist-clear" onClick={clearWishlist}>Clear wishlist</button>
      </div>

      <div className="wishlist-grid">
        {items.map((course) => (
          <CourseCard key={course._id} course={course} owned={owned.has(String(course._id))} />
        ))}
      </div>
    </div>
  );
}

export default Wishlist;
