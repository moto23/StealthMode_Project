import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

import Contact from "./Contact";
import Footer from "./Footer";
import Main from "./Main";
import About from "./About";

function Home() {
  const location = useLocation();

  // When arriving with a hash (e.g. navigating "/#about" from another route),
  // scroll the target section into view once the page has mounted.
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [location]);

  return (
    <div>

      <Main/>
      <About/>
      <Contact/>
      <Footer/>

    </div>
  )
}

export default Home
