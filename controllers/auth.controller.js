import crypto from 'crypto';
import User from '../models/User.js';
import { asyncHandler, ok, ApiError } from '../utils/helpers.js';
import { issueToken, clearTokenCookie } from '../middleware/auth.js';
import { emailService } from '../services/email.service.js';
import config from '../config/config.js';

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) throw new ApiError(400, 'Name, email and password are required.');
  if (password.length < 8) throw new ApiError(422, 'Password must be at least 8 characters.');

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with this email already exists.');

  // Role is ALWAYS USER on public registration — never trust client-supplied roles
  const user = await User.create({ name, email, password, phone, role: 'USER' });

  const token = issueToken(user, res, 201);
  emailService.sendWelcomeEmail(user);
  ok(res, { token, user: user.toSafeJSON() }, 'Account created successfully.', 201);
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw new ApiError(400, 'Email and password are required.');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  // Uniform error → does not reveal whether the email exists
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }
  if (user.isBlocked) throw new ApiError(403, 'Your account has been blocked. Contact support.');

  const token = issueToken(user, res);
  ok(res, { token, user: user.toSafeJSON() }, 'Logged in successfully.');
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (req, res) => {
  clearTokenCookie(res);
  ok(res, {}, 'Logged out.');
});

/** GET /api/auth/me */
export const getMe = asyncHandler(async (req, res) => {
  ok(res, { user: req.user.toSafeJSON() });
});

/** PUT /api/auth/me — update profile */
export const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'avatar', 'address'];
  const updates = {};
  allowed.forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
  ok(res, { user: user.toSafeJSON() }, 'Profile updated.');
});

/** POST /api/auth/google — verify Google ID token, upsert user, issue JWT */
export const googleAuth = asyncHandler(async (req, res) => {
  const { credential } = req.body; // ID token from Google Identity Services
  if (!credential) throw new ApiError(400, 'Google credential is required.');
  if (!config.google.clientId) throw new ApiError(503, 'Google OAuth is not configured on this server.');

  // Verify the ID token against Google's tokeninfo endpoint
  const resp = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!resp.ok) throw new ApiError(401, 'Google sign-in failed: invalid token.');
  const info = await resp.json();

  if (info.aud !== config.google.clientId) throw new ApiError(401, 'Google token audience mismatch.');
  if (info.email_verified !== 'true' && info.email_verified !== true) {
    throw new ApiError(401, 'Google account email is not verified.');
  }

  let user = await User.findOne({ email: info.email.toLowerCase() });
  if (!user) {
    user = await User.create({
      name: info.name || info.email.split('@')[0],
      email: info.email.toLowerCase(),
      googleId: info.sub,
      authProvider: 'google',
      role: 'USER', // OAuth users always start as USER
      avatar: info.picture || ''
    });
    emailService.sendWelcomeEmail(user);
  } else if (!user.googleId) {
    user.googleId = info.sub;
    user.authProvider = user.password ? user.authProvider : 'google';
    await user.save();
  }

  if (user.isBlocked) throw new ApiError(403, 'Your account has been blocked. Contact support.');

  const token = issueToken(user, res);
  ok(res, { token, user: user.toSafeJSON() }, `Signed in as ${user.name}.`);
});

/** POST /api/auth/forgot-password — always responds the same whether or not the email exists */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const genericMsg = 'If that email is registered, a reset link has been sent. Check your inbox.';

  const user = await User.findOne({ email: String(email || '').toLowerCase() });
  if (user) {
    const raw = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    const resetUrl = `${config.frontendUrl}/reset-password?token=${raw}`;
    await emailService.sendPasswordResetEmail(user, resetUrl);
  }
  ok(res, {}, genericMsg);
});

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) throw new ApiError(400, 'Token and new password are required.');
  if (password.length < 8) throw new ApiError(422, 'Password must be at least 8 characters.');

  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) throw new ApiError(400, 'Reset link is invalid or has expired.');

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  const jwt = issueToken(user, res);
  ok(res, { token: jwt, user: user.toSafeJSON() }, 'Password reset successful.');
});

/** PUT /api/auth/change-password */
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Current and new password are required.');
  if (newPassword.length < 8) throw new ApiError(422, 'New password must be at least 8 characters.');

  const user = await User.findById(req.user._id).select('+password');
  if (user.authProvider === 'google' && !user.password) {
    throw new ApiError(400, 'This account uses Google sign-in and has no local password.');
  }
  if (!(await user.comparePassword(currentPassword))) {
    throw new ApiError(401, 'Current password is incorrect.');
  }
  user.password = newPassword;
  await user.save();
  ok(res, {}, 'Password changed successfully.');
});
