import React, { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaHeart, FaRegHeart } from 'react-icons/fa';
import { CartContext } from '../../context/CartContext';
import { UserContext } from '../../context/UserContext';
import { useWishlist } from '../../context/WishlistContext';
import { useToast } from '../../context/ToastContext';
import { buyNowSingle } from '../../services/checkout';
import { formatINR, hasDiscount, discountPercent, isPaid } from '../../services/price';
import '../css/CourseCard.css';

function CourseCard({ course, owned = false, onPurchased }) {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const { addToCart, inCart } = useContext(CartContext);
  const { inWishlist, toggleWishlist } = useWishlist();
  const toast = useToast();
  const [purchased, setPurchased] = useState(owned);
  const [processing, setProcessing] = useState(false);
  const wished = inWishlist(course._id);

  const handleToggleWishlist = () => {
    toggleWishlist(course);
    toast.success(wished ? 'Removed from wishlist' : 'Saved to wishlist');
  };

  const paid = isPaid(course);
  const discounted = hasDiscount(course);
  const alreadyOwned = purchased || owned;
  const inCartAlready = inCart(course._id);

  const requireLogin = () => {
    if (!user) {
      navigate('/login');
      return false;
    }
    return true;
  };

  const handleAddToCart = () => {
    if (inCartAlready) {
      navigate('/cart');
      return;
    }
    addToCart(course);
    toast.success(`Added “${course.title}” to your cart`);
  };

  const handleBuyNow = async () => {
    if (!requireLogin() || processing) return;
    setProcessing(true);
    await buyNowSingle({
      course,
      user,
      onSuccess: () => {
        setPurchased(true);
        setProcessing(false);
        onPurchased && onPurchased(course._id);
        toast.success(`You now own “${course.title}”. Find it in your profile.`);
      },
      onError: (msg) => {
        toast.error(msg);
        setProcessing(false);
      },
      onDismiss: () => setProcessing(false),
    });
  };

  const detailsPath = `/enroll/${String(course._id).trim()}`;

  return (
    <div className="ec-card">
      <div className="ec-card-media">
        <img src={course.imageUrl} alt={course.title} loading="lazy" />
        {course.label && <span className="ec-badge ec-badge-label">{course.label}</span>}
        {paid && discounted && (
          <span className="ec-badge ec-badge-discount">-{discountPercent(course)}%</span>
        )}
        <button
          type="button"
          className={`ec-wishlist${wished ? ' is-active' : ''}`}
          onClick={handleToggleWishlist}
          aria-pressed={wished}
          aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}
          title={wished ? 'Remove from wishlist' : 'Save to wishlist'}
        >
          {wished ? <FaHeart /> : <FaRegHeart />}
        </button>
      </div>

      <div className="ec-card-body">
        <div className="ec-meta-top">
          {course.category && <span className="ec-chip">{course.category}</span>}
          {course.level && <span className="ec-chip ec-chip-ghost">{course.level}</span>}
        </div>

        <h3 className="ec-title">
          <Link to={detailsPath}>{course.title}</Link>
        </h3>

        {course.description && <p className="ec-desc">{course.description}</p>}

        <ul className="ec-facts">
          {course.instructor && (
            <li><span>Instructor</span>{course.instructor}</li>
          )}
          {course.duration && (
            <li><span>Duration</span>{course.duration}</li>
          )}
        </ul>

        <div className="ec-price-row">
          {paid ? (
            <>
              <span className="ec-price">{formatINR(course.price)}</span>
              {discounted && (
                <>
                  <span className="ec-price-original">{formatINR(course.originalPrice)}</span>
                  <span className="ec-price-off">{discountPercent(course)}% off</span>
                </>
              )}
            </>
          ) : (
            <span className="ec-price ec-price-free">Free</span>
          )}
        </div>

        <div className="ec-actions">
          {alreadyOwned ? (
            <button className="ec-btn ec-btn-owned" disabled>Purchased</button>
          ) : paid ? (
            <>
              <button className="ec-btn ec-btn-outline" onClick={handleAddToCart}>
                {inCartAlready ? 'Go to Cart' : 'Add to Cart'}
              </button>
              <button className="ec-btn ec-btn-primary" onClick={handleBuyNow} disabled={processing}>
                {processing ? 'Processing…' : 'Buy Now'}
              </button>
            </>
          ) : (
            <Link to={detailsPath} className="ec-btn ec-btn-primary ec-btn-block">
              Enroll for Free
            </Link>
          )}
        </div>

        <Link to={detailsPath} className="ec-explore">View Details →</Link>
      </div>
    </div>
  );
}

export default CourseCard;
