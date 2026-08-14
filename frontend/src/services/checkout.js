import api from './api';

// Load the Razorpay checkout script on demand (not bundled/global).
export const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Open the Razorpay widget for an already server-created order. The key, amount,
// currency and order id ALL come from the server response — never hardcoded and
// never computed in the browser.
const openCheckout = ({ order, user, description, verify, onSuccess, onError, onDismiss }) => {
  const options = {
    key: order.key, // public test key id from the server (never a secret)
    amount: String(order.amount), // paise, server-calculated
    currency: order.currency,
    name: 'StealthMode',
    description,
    order_id: order.orderId,
    handler: async (response) => {
      try {
        const res = await verify({
          orderId: order.orderId,
          paymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        });
        onSuccess(res.data);
      } catch (err) {
        onError(err?.response?.data?.error || 'Payment verification failed.');
      }
    },
    prefill: { name: user?.fullName, email: user?.email },
    theme: { color: '#4b0082' },
    modal: { ondismiss: () => onDismiss && onDismiss() },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', () => onError('Payment failed. Please try again.'));
  rzp.open();
};

// Single-course "Buy Now" — uses the unchanged Phase 3 endpoints and preserves
// the exact original behavior (Course -> Buy Now -> Razorpay -> Verify -> Enroll).
export const buyNowSingle = async ({ course, user, onSuccess, onError, onDismiss }) => {
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    onError('Failed to load the payment gateway. Please try again.');
    onDismiss && onDismiss();
    return;
  }
  try {
    const { data } = await api.post('/api/payments/create-order', { courseId: course._id });
    openCheckout({
      order: data.data,
      user,
      description: course.title,
      verify: (payload) => api.post('/api/payments/verify', payload),
      onSuccess,
      onError,
      onDismiss,
    });
  } catch (err) {
    onError(err?.response?.data?.error || 'Failed to initiate payment. Please try again.');
    onDismiss && onDismiss();
  }
};

// Multi-course cart checkout — ONE Razorpay order for the whole cart. The server
// computes the authoritative total from DB prices; we only send course ids.
export const checkoutCart = async ({ items, user, onSuccess, onError, onDismiss }) => {
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    onError('Failed to load the payment gateway. Please try again.');
    onDismiss && onDismiss();
    return;
  }
  try {
    const courseIds = items.map((i) => i._id);
    const { data } = await api.post('/api/payments/cart/create-order', { courseIds });
    openCheckout({
      order: data.data,
      user,
      description: `${data.data.items.length} course(s)`,
      verify: (payload) => api.post('/api/payments/cart/verify', payload),
      onSuccess,
      onError,
      onDismiss,
    });
  } catch (err) {
    onError(err?.response?.data?.error || 'Failed to initiate checkout. Please try again.');
    onDismiss && onDismiss();
  }
};
