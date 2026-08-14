import React, { useContext, useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CartContext } from '../../context/CartContext';
import { UserContext } from '../../context/UserContext';
import api from '../../services/api';
import { checkoutCart } from '../../services/checkout';
import { formatINR, hasDiscount } from '../../services/price';
import '../css/Cart.css';

function Cart() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const { items, removeFromCart, clearCart } = useContext(CartContext);
  const [owned, setOwned] = useState(() => new Set());
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');

  // Authoritative ownership so we don't try to re-charge owned courses.
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

  // Only non-owned courses are payable; totals reflect exactly what's charged.
  const payable = useMemo(() => items.filter((c) => !owned.has(c._id)), [items, owned]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let total = 0;
    payable.forEach((c) => {
      const list = hasDiscount(c) ? c.originalPrice : c.price;
      subtotal += list;
      total += c.price;
    });
    return { subtotal, total, discount: Math.max(0, subtotal - total) };
  }, [payable]);

  const handleCheckout = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (processing || payable.length === 0) return;
    setProcessing(true);
    setMessage('');
    await checkoutCart({
      items: payable,
      user,
      onSuccess: (data) => {
        const purchased = new Set((data.courseIds || []).map(String));
        // Remove purchased items from the cart; keep anything else.
        purchased.forEach((id) => removeFromCart(id));
        setOwned((prev) => new Set([...prev, ...purchased]));
        setProcessing(false);
        setMessage('Payment successful! Your courses are now in your profile.');
      },
      onError: (msg) => {
        setProcessing(false);
        setMessage(msg);
      },
      onDismiss: () => setProcessing(false),
    });
  };

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-empty">
          <h2>Your cart is empty</h2>
          {message && <p className="cart-message">{message}</p>}
          <p>Browse the catalog and add courses you’d like to buy.</p>
          <Link to="/dashboard" className="cart-btn cart-btn-primary">Continue Shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="cart-header">
        <h1>Shopping Cart</h1>
        <span className="cart-count">{items.length} {items.length === 1 ? 'Course' : 'Courses'}</span>
      </div>

      {message && <p className="cart-message">{message}</p>}

      <div className="cart-layout">
        <ul className="cart-items">
          {items.map((c) => {
            const isOwned = owned.has(c._id);
            return (
              <li key={c._id} className="cart-item">
                <img className="cart-item-img" src={c.imageUrl} alt={c.title} loading="lazy" />
                <div className="cart-item-info">
                  <Link to={`/enroll/${c._id}`} className="cart-item-title">{c.title}</Link>
                  {c.instructor && <span className="cart-item-instructor">{c.instructor}</span>}
                  {isOwned && <span className="cart-item-owned">Already purchased — won’t be charged</span>}
                </div>
                <div className="cart-item-price">
                  <span className="cart-item-current">{formatINR(c.price)}</span>
                  {hasDiscount(c) && (
                    <span className="cart-item-original">{formatINR(c.originalPrice)}</span>
                  )}
                </div>
                <button className="cart-remove" onClick={() => removeFromCart(c._id)} aria-label="Remove">
                  Remove
                </button>
              </li>
            );
          })}
        </ul>

        <aside className="cart-summary">
          <h3>Order Summary</h3>
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <span>{formatINR(totals.subtotal)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="cart-summary-row cart-summary-discount">
              <span>Discount</span>
              <span>−{formatINR(totals.discount)}</span>
            </div>
          )}
          <div className="cart-summary-row cart-summary-total">
            <span>Total</span>
            <span>{formatINR(totals.total)}</span>
          </div>
          <p className="cart-summary-note">Final amount is verified securely on our server.</p>
          <button
            className="cart-btn cart-btn-primary cart-btn-block"
            onClick={handleCheckout}
            disabled={processing || payable.length === 0}
          >
            {processing ? 'Processing…' : payable.length === 0 ? 'Nothing to Pay' : 'Proceed to Checkout'}
          </button>
          <div className="cart-actions-secondary">
            <Link to="/dashboard" className="cart-link">Continue Shopping</Link>
            <button className="cart-link cart-link-danger" onClick={clearCart}>Clear Cart</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default Cart;
