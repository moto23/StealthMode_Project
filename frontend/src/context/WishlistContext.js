import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export const WishlistContext = createContext();

const STORAGE_KEY = 'stealthmode_wishlist';

// Store only display fields (same shape the CourseCard needs). This is purely a
// local favorites list — it never touches the cart, ownership, or payments.
const normalize = (course) => ({
  _id: String(course._id),
  title: course.title || '',
  description: course.description || '',
  instructor: course.instructor || '',
  category: course.category || '',
  level: course.level || '',
  duration: course.duration || '',
  label: course.label || '',
  imageUrl: course.imageUrl || '',
  price: Number(course.price) || 0,
  originalPrice:
    course.originalPrice != null && Number(course.originalPrice) > Number(course.price)
      ? Number(course.originalPrice)
      : null,
});

const loadInitial = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const WishlistProvider = ({ children }) => {
  const [items, setItems] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [items]);

  const inWishlist = useCallback(
    (courseId) => items.some((c) => c._id === String(courseId)),
    [items]
  );

  const removeFromWishlist = useCallback((courseId) => {
    setItems((prev) => prev.filter((c) => c._id !== String(courseId)));
  }, []);

  // Add if absent, remove if present (dedupe by _id).
  const toggleWishlist = useCallback((course) => {
    setItems((prev) => {
      const id = String(course._id);
      if (prev.some((c) => c._id === id)) return prev.filter((c) => c._id !== id);
      return [...prev, normalize(course)];
    });
  }, []);

  const clearWishlist = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({
      items,
      count: items.length,
      inWishlist,
      toggleWishlist,
      removeFromWishlist,
      clearWishlist,
    }),
    [items, inWishlist, toggleWishlist, removeFromWishlist, clearWishlist]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
};

export const useWishlist = () => useContext(WishlistContext);
