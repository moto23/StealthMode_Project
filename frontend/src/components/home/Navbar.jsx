import React, { useContext, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { UserContext } from '../../context/UserContext';
import { CartContext } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { FaUser, FaSignOutAlt, FaChevronDown, FaBars, FaTimes, FaUserShield, FaShoppingCart, FaHeart } from 'react-icons/fa';
import '../css/Navbar.css';

function Navbar() {
  const { user, logout } = useContext(UserContext);
  const { count } = useContext(CartContext);
  const { count: wishlistCount } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebar, setSidebar] = useState(false);

  const handleLogout = () => {
    logout(); // Clear token + user context
    navigate('/'); // Redirect to the Main page
  };

  const toggleSidebar = () => {
    setSidebar(!sidebar);
  };

  // About/Contact live only on the home page. A bare "#about" hash does nothing
  // on other routes, so scroll when already home, otherwise route home first
  // (Home reads the hash and scrolls into view after mount).
  const goToSection = (id) => (e) => {
    e.preventDefault();
    setSidebar(false);
    if (location.pathname === '/') {
      const el = document.getElementById(id);
      if (el) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      }
    } else {
      navigate(`/#${id}`);
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">StealthMode</Link>
        <div className="menu-icon" onClick={toggleSidebar}>
          {sidebar ? <FaTimes /> : <FaBars />}
        </div>
        <ul className={sidebar ? "nav-menu active" : "nav-menu"}>
          <li className="nav-item">
            <Link to="/" className="nav-links" onClick={toggleSidebar}>Home</Link>
          </li>
          <li className="nav-item">
            <a href="/#about" className="nav-links" onClick={goToSection('about')}>About</a>
          </li>
          <li className="nav-item">
            <a href="/#contact" className="nav-links" onClick={goToSection('contact')}>Contact</a>
          </li>
          <li className="nav-item">
            <Link to="/wishlist" className="nav-links nav-cart" onClick={toggleSidebar}>
              <FaHeart /> Wishlist
              {wishlistCount > 0 && <span className="cart-badge">{wishlistCount}</span>}
            </Link>
          </li>
          <li className="nav-item">
            <Link to="/cart" className="nav-links nav-cart" onClick={toggleSidebar}>
              <FaShoppingCart /> Cart
              {count > 0 && <span className="cart-badge">{count}</span>}
            </Link>
          </li>
          {user ? (
            <li className="nav-item dropdown">
              <span className="nav-links">{user.fullName} <FaChevronDown /></span>
              <div className="dropdown-content">
                <Link to="/profile"><FaUser /> Profile</Link>
                {user.role === 'admin' && (
                  <Link to="/admin/courses"><FaUserShield /> Admin</Link>
                )}
                <span className="logout-link" onClick={handleLogout}><FaSignOutAlt /> Logout</span>
              </div>
            </li>
          ) : (
            <li className="nav-item">
              <Link to="/login" className="nav-links" onClick={toggleSidebar}>Login/Register</Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}

export default Navbar;
