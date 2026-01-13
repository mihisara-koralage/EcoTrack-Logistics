/**
 * Error Logging Middleware for EcoTrack Logistics System
 * 
 * Provides comprehensive error logging without crashing the system:
 * - API failure logging
 * - Graceful error handling
 * - System resilience monitoring
 */

const errorLogger = (err, req, res, next) => {
  // Log error details
  console.error('=== ERROR LOG ===');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Method:', req.method);
  console.error('URL:', req.originalUrl);
  console.error('User:', req.user ? req.user.email : 'Anonymous');
  console.error('Error Name:', err.name);
  console.error('Error Message:', err.message);
  console.error('Error Stack:', err.stack);
  console.error('==================');

  // Categorize errors for better monitoring
  const errorCategory = categorizeError(err);
  console.error('Error Category:', errorCategory);

  // Send appropriate response
  if (res.headersSent) {
    console.warn('Response already sent, skipping error response');
    return;
  }

  // Handle Map API specific errors
  if (isMapApiError(err)) {
    console.warn('Map API error detected:', err.message);
    return res.status(503).json({
      success: false,
      message: 'Map service temporarily unavailable. Using fallback routing.',
      fallback: true,
      errorCategory: 'map_api_failure',
      timestamp: new Date().toISOString()
    });
  }

  // Handle validation errors
  if (isValidationError(err)) {
    return res.status(400).json({
      success: false,
      message: err.message || 'Validation failed',
      errorCategory: 'validation',
      details: err.details || null,
      timestamp: new Date().toISOString()
    });
  }

  // Handle authorization errors
  if (isAuthorizationError(err)) {
    return res.status(403).json({
      success: false,
      message: err.message || 'Access denied',
      errorCategory: 'authorization',
      timestamp: new Date().toISOString()
    });
  }

  // Handle database errors
  if (isDatabaseError(err)) {
    console.error('Database error:', err);
    return res.status(500).json({
      success: false,
      message: 'Database operation failed. Please try again.',
      errorCategory: 'database',
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  const statusCode = err.statusCode || err.status || 500;
  const message = statusCode < 500 ? err.message : 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message: message,
    errorCategory: errorCategory,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Categorize error for monitoring
 * @private
 */
function categorizeError(err) {
  if (err.name === 'ValidationError') return 'validation';
  if (err.name === 'CastError') return 'data_type';
  if (err.name === 'MongoError') return 'database';
  if (err.message?.includes('E11000')) return 'duplicate';
  if (err.message?.includes('ENOTFOUND') || err.message?.includes('ECONNREFUSED')) return 'network';
  if (err.message?.includes('Map API') || err.message?.includes('mapservice')) return 'map_api';
  if (err.message?.includes('timeout')) return 'timeout';
  if (err.message?.includes('unauthorized') || err.message?.includes('forbidden')) return 'authorization';
  
  return 'unknown';
}

/**
 * Check if error is Map API related
 * @private
 */
function isMapApiError(err) {
  const mapApiKeywords = [
    'Map API', 'mapservice', 'geocoding', 'directions',
    'GOOGLE_MAPS_API', 'MAPBOX_ACCESS_TOKEN',
    'rate limit', 'quota exceeded', 'invalid api key'
  ];
  
  return mapApiKeywords.some(keyword => 
    err.message?.toLowerCase().includes(keyword.toLowerCase())
  );
}

/**
 * Check if error is validation related
 * @private
 */
function isValidationError(err) {
  return err.name === 'ValidationError' || 
         err.name === 'CastError' ||
         err.message?.includes('required') ||
         err.message?.includes('invalid');
}

/**
 * Check if error is authorization related
 * @private
 */
function isAuthorizationError(err) {
  return err.message?.includes('unauthorized') ||
         err.message?.includes('forbidden') ||
         err.message?.includes('access denied') ||
         err.status === 403 ||
         err.statusCode === 403;
}

/**
 * Check if error is database related
 * @private
 */
function isDatabaseError(err) {
  return err.name === 'MongoError' ||
         err.name === 'MongooseError' ||
         err.message?.includes('connection') ||
         err.message?.includes('database');
}

/**
 * Log successful operations for monitoring
 * @param {Object} req - Express request object
 * @param {Object} result - Operation result
 */
export const logSuccess = (req, result) => {
  console.log('=== SUCCESS LOG ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('User:', req.user ? req.user.email : 'Anonymous');
  console.log('Result:', result.success ? 'Success' : 'Failed');
  console.log('==================');
};

/**
 * Log Map API status for monitoring
 * @param {boolean} isAvailable - Whether Map API is available
 * @param {string} provider - Map provider (google, mapbox)
 */
export const logMapApiStatus = (isAvailable, provider) => {
  console.log('=== MAP API STATUS ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Provider:', provider);
  console.log('Status:', isAvailable ? 'Available' : 'Unavailable');
  console.log('==================');
};

/**
 * Get system health status
 * @returns {Object} System health information
 */
export const getSystemHealth = () => {
  return {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform
  };
};

export default errorLogger;
