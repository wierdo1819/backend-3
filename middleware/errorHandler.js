/**
 * Custom application error carrying an HTTP status code and optional validation details.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Centralized Express error-handling middleware.
 * Normalizes Mongoose ValidationError, CastError, Mongo duplicate key (11000),
 * malformed JSON errors, and custom AppErrors into consistent JSON responses.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Malformed JSON in request body',
    });
  }

  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      error: 'Validation Error',
      message: details.map((d) => d.message).join('; '),
      details,
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid Identifier',
      message: `Invalid value for ${err.path}: "${err.value}"`,
    });
  }

  if (err.code === 11000) {
    const duplicateFields = err.keyValue ? Object.keys(err.keyValue) : ['sku'];
    const field = duplicateFields[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : undefined;
    return res.status(409).json({
      error: 'Duplicate Key Error',
      message: value !== undefined
        ? `A product with ${field} "${value}" already exists`
        : `Duplicate value for unique field "${field}"`,
      field,
    });
  }

  if (err instanceof AppError || err.statusCode) {
    const statusCode = err.statusCode || 400;
    const payload = {
      error: statusCode === 404 ? 'Not Found' : 'Bad Request',
      message: err.message,
    };
    if (err.details !== undefined) {
      payload.details = err.details;
    }
    return res.status(statusCode).json(payload);
  }

  console.error('Unhandled error:', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message || 'An unexpected error occurred',
  });
}

module.exports = {
  AppError,
  errorHandler,
};
