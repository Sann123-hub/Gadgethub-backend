import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateUser } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  register, login, logout, getMe, updateProfile,
  googleAuth, forgotPassword, resetPassword, changePassword
} from '../controllers/auth.controller.js';

const router = Router();

// Rate limit auth endpoints — brute-force protection
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.' }
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleAuth);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

router.post('/logout', logout);
router.get('/me', authenticateUser, getMe);
router.put('/me', authenticateUser, upload.single('avatar'), updateProfile);
router.put('/change-password', authenticateUser, changePassword);

export default router;
