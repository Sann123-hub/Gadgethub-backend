/** 404 + centralized error handler with consistent JSON shape */
export const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let status = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
  let message = err.message || 'Server error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier format.';
  }
  // Duplicate key
  if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value for ${field}. It must be unique.`;
  }
  // Mongoose validation
  if (err.name === 'ValidationError') {
    status = 422;
    message = Object.values(err.errors).map((e) => e.message).join('. ');
  }
  // JWT
  if (err.name === 'JsonWebTokenError') {
    status = 401;
    message = 'Invalid token.';
  }

  if (status >= 500) console.error('✗ Error:', err);

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack?.split('\n').slice(0, 3) } : {})
  });
};
