import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';

export const CartContext = createContext();

const STORAGE_KEY = 'stealthmode_cart';

// Keep only the fields the cart UI needs (authoritative pricing is always
// recomputed server-side at checkout — this is display-only).
const normalize = (course) => ({
  _id: String(course._id),
  title: course.title || '',
  instructor: course.instructor || '',
  category: course.category || '',
  level: course.level || '',
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

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(loadInitial);

  // Persist across refreshes.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [items]);

  // Add a course; never allow duplicates (dedupe by _id).
  const addToCart = useCallback((course) => {
    setItems((prev) => {
      const id = String(course._id);
      if (prev.some((c) => c._id === id)) return prev;
      return [...prev, normalize(course)];
    });
  }, []);

  const removeFromCart = useCallback((courseId) => {
    setItems((prev) => prev.filter((c) => c._id !== String(courseId)));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const inCart = useCallback(
    (courseId) => items.some((c) => c._id === String(courseId)),
    [items]
  );

  // Display-only totals (server recomputes the authoritative amount at checkout).
  const totals = useMemo(() => {
    let subtotal = 0;
    let total = 0;
    items.forEach((c) => {
      const list = c.originalPrice && c.originalPrice > c.price ? c.originalPrice : c.price;
      subtotal += list;
      total += c.price;
    });
    return { subtotal, total, discount: Math.max(0, subtotal - total) };
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      count: items.length,
      addToCart,
      removeFromCart,
      clearCart,
      inCart,
      ...totals,
    }),
    [items, addToCart, removeFromCart, clearCart, inCart, totals]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
