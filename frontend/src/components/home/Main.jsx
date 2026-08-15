import React from 'react';
import { Link } from 'react-router-dom';
import TypingEffect from './TypingEffect';
import '../css/Main.css';

function Main() {
  // Truthful descriptors (removed "FREE" — the catalog is paid).
  const words = ['EXPERT-LED', 'PRACTICAL', 'PROJECT-BASED'];

  return (
    <section id="main" className="hero">
      {/* Ambient espresso lighting spanning the full viewport. */}
      <div className="hero-bg" aria-hidden="true">
        <span className="hero-glow hero-glow-1" />
        <span className="hero-glow hero-glow-2" />
        <span className="hero-glow hero-glow-3" />
        <span className="hero-vignette" />
      </div>

      <div className="hero-inner">
        {/* Left — marketing message sits on the atmosphere (no giant slab). */}
        <div className="hero-content">
          <span className="hero-eyebrow">Premium course marketplace</span>
          <h1 className="hero-headline">
            <span className="hero-line">Stay Ahead Of The Curve</span>
            <span className="hero-line hero-line-typing">
              With Our <TypingEffect words={words} />
            </span>
            <span className="hero-line">Courses</span>
          </h1>
          <p className="hero-sub">
            Industry-focused, project-based programs — crafted to move your career forward.
          </p>
          <div className="hero-cta">
            <Link to="/dashboard" className="hero-btn">Explore Courses</Link>
            <a href="#about" className="hero-link">Learn more</a>
          </div>
        </div>

        {/* Right — layered frosted-glass composition (purely decorative). */}
        <div className="hero-visual" aria-hidden="true">
          <div className="hv-orb hv-orb-a" />
          <div className="hv-orb hv-orb-b" />
          <div className="hv-ring" />

          <div className="hv-stack">
            <div className="hv-card hv-card-back" />

            <div className="hv-card hv-card-main">
              <div className="hv-media">
                <span className="hv-monogram">S</span>
                <span className="hv-sheen" />
              </div>
              <div className="hv-body">
                <span className="hv-bar hv-bar-wide" />
                <span className="hv-bar hv-bar-mid" />
                <span className="hv-foot">
                  <span className="hv-dot" />
                  <span className="hv-pill" />
                </span>
              </div>
            </div>

            <div className="hv-chip hv-chip-1">
              <span className="hv-chip-dot" />
              <span className="hv-chip-bar" />
            </div>
            <div className="hv-chip hv-chip-2">
              <span className="hv-chip-ring" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Main;
