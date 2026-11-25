/**
 * Handles requests to undefined routes with a 404 JSON response.
 */
function notFound(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = notFound;
