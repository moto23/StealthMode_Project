// Display helpers for pricing. Discounts are shown ONLY when a real
// originalPrice greater than price exists — never invented.

export const formatINR = (amount) =>
  `₹${Number(amount || 0).toLocaleString('en-IN')}`;

export const hasDiscount = (course) =>
  course &&
  course.originalPrice != null &&
  Number(course.originalPrice) > Number(course.price);

export const discountPercent = (course) => {
  if (!hasDiscount(course)) return 0;
  const op = Number(course.originalPrice);
  const p = Number(course.price);
  return Math.round(((op - p) / op) * 100);
};

export const isPaid = (course) => Number(course?.price) > 0;
