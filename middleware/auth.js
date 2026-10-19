import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import config from '../config/config.js';

/** Verify JWT (header or httpOnly cookie) and attach req.user */
export const authenticateUser = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      const msg = err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid token.';
      return res.status(401).json({ success: false, message: msg });
    }

    const user = await User.findById(decoded.id).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    }
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Your account has been blocked. Contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Role gate. Usage: router.get('/x', authenticateUser, authorizeRoles('ADMIN')) */
export const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Access denied. Requires role: ${roles.join(' or ')}. You are: ${req.user.role}.`
    });
  }
  next();
};

/** Shopping gate: only customer accounts (role USER) may buy. Staff cannot shop. */
export const customerOnly = (req, res, next) => {
  if (req.user.role !== 'USER') {
    return res.status(403).json({
      success: false,
      message: 'Shopping is limited to customer accounts. Staff accounts (admin/manager/seller) cannot place orders.'
    });
  }
  next();
};

/** Issue JWT + set httpOnly cookie */
export const issueToken = (user, res, statusCode = 200) => {
  const token = jwt.sign({ id: user._id, role: user.role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });

  const cookieOpts = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  };
  res.cookie('token', token, cookieOpts);

  return token;
};

export const clearTokenCookie = (res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
};
