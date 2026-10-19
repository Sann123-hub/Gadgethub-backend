import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../middleware/auth.js';
import { sellerDashboard, sellerOrders, sellerReviews, sellerAnalytics, sellerReport } from '../controllers/seller.controller.js';

const router = Router();

router.use(authenticateUser, authorizeRoles('SELLER', 'ADMIN'));

router.get('/dashboard', sellerDashboard);
router.get('/orders', sellerOrders);
router.get('/reviews', sellerReviews);
router.get('/analytics', sellerAnalytics);
router.get('/reports/:kind/:format?', sellerReport);

export default router;
