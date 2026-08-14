// Small typed error carrying an HTTP status code, formatted by the
// central error handler as { success: false, error }.
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
  static badRequest(msg) {
    return new ApiError(400, msg);
  }
  static unauthorized(msg) {
    return new ApiError(401, msg);
  }
  static forbidden(msg) {
    return new ApiError(403, msg);
  }
  static notFound(msg) {
    return new ApiError(404, msg);
  }
  static conflict(msg) {
    return new ApiError(409, msg);
  }
}

module.exports = ApiError;
