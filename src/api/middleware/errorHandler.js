import { logger } from '../../lib/logger.js';
import { config } from '../../config/index.js';

export function errorHandler(err, req, res, next) {
  logger.error({ err: err.message, path: req.path, method: req.method }, 'Request error');

  if (err.name === 'MulterError') {
    return res.status(400).json({ error: `File upload error: ${err.message}` });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error', details: err.errors });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const status = err.status || err.statusCode || 500;
  const message = config.nodeEnv === 'production' ? 'Internal server error' : (err.message || 'Unknown error');

  res.status(status).json({ error: message });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}