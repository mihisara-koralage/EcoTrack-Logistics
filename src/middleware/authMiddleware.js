import jwt from 'jsonwebtoken';

import User from '../models/User.js';

const extractToken = (authorizationHeader = '') => {
  if (authorizationHeader.startsWith('Bearer ')) {
    return authorizationHeader.split(' ')[1];
  }
  return null;
};

const protect = async (req, res, next) => {
  try {
    const token = extractToken(req.headers.authorization);

    if (!token) {
      return res.status(401).json({ message: 'Authentication token missing.' });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not configured.');
    }

    // Verify token integrity and expiration before trusting payload
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Retrieve the authenticated user so downstream handlers have access to role and profile
    const user = await User.findById(decoded.sub).select('-password');
    if (!user) {
      return res.status(401).json({ message: 'User associated with token no longer exists.' });
    }

    // Attach authenticated user details to request for protected routes
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Authentication token has expired.' });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid authentication token.' });
    }

    next(error);
  }
};

const authorizeRoles = (...allowedRoles) => {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const { role } = req.user;

    // Supervisors can access any protected route without extra checks
    if (role === 'Supervisor') {
      return next();
    }

    // Example usage: authorizeRoles('Driver') for delivery specific endpoints
    if (allowed.size === 0 || allowed.has(role)) {
      return next();
    }

    return res.status(403).json({ message: 'Access denied for your role.' });
  };
};

// A stricter version of authorizeRoles that does not grant automatic access to Supervisors
const authorizeExactRoles = (...allowedRoles) => {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (allowed.has(req.user.role)) {
      return next();
    }

    return res.status(403).json({ message: 'Access denied for your role.' });
  };
};

export { protect, authorizeRoles, authorizeExactRoles };
