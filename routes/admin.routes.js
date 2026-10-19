import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../middleware/auth.js';
import {
  listUsers, changeUserRole, toggleBlockUser, deleteUser, toggleManager, createManager,
  managerProducts, managerReviews, moderateReview, managerDeleteReview,
  listComplaints, updateComplaint, sellerMonitoring, inventoryOverview,
  adminStats, platformAnalytics,
  createCategory, updateCategory, deleteCategory,
  createBrand, updateBrand, deleteBrand
} from '../controllers/admin.controller.js';
import { adminReports, downloadAdminReport } from '../controllers/report.controller.js';

const router = Router();
router.use(authenticateUser);

/* ── MANAGER + ADMIN shared ── */
const managerOnly = authorizeRoles('MANAGER', 'ADMIN');

router.get('/manager/products', managerOnly, managerProducts);
router.get('/manager/reviews', managerOnly, managerReviews);
router.put('/manager/reviews/:id/moderate', managerOnly, moderateReview);
router.delete('/manager/reviews/:id', managerOnly, managerDeleteReview);
router.get('/manager/complaints', managerOnly, listComplaints);
router.put('/manager/complaints/:id', managerOnly, updateComplaint);
router.get('/manager/sellers', managerOnly, sellerMonitoring);
router.get('/manager/inventory', managerOnly, inventoryOverview);
router.get('/analytics', managerOnly, platformAnalytics);

/* ── ADMIN only ── */
const adminOnly = authorizeRoles('ADMIN');

router.get('/admin/stats', adminOnly, adminStats);
router.get('/admin/users', adminOnly, listUsers);
router.put('/admin/users/:id/role', adminOnly, changeUserRole);
router.put('/admin/users/:id/block', adminOnly, toggleBlockUser);
router.delete('/admin/users/:id', adminOnly, deleteUser);
router.post('/admin/managers', adminOnly, createManager);
router.put('/admin/managers/:id/disable', adminOnly, toggleManager);

router.post('/admin/categories', adminOnly, createCategory);
router.put('/admin/categories/:id', adminOnly, updateCategory);
router.delete('/admin/categories/:id', adminOnly, deleteCategory);
router.post('/admin/brands', adminOnly, createBrand);
router.put('/admin/brands/:id', adminOnly, updateBrand);
router.delete('/admin/brands/:id', adminOnly, deleteBrand);

router.get('/admin/reports', managerOnly, adminReports);
router.get('/admin/reports/:kind/:format?', managerOnly, downloadAdminReport);

export default router;
