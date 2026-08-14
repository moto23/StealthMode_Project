// Wraps an async route handler so thrown/rejected errors reach the
// central Express error handler instead of crashing the request.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
