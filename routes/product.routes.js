import { Router } from 'express';
import { authenticateUser, authorizeRoles } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  listProducts, getProduct, createProduct, updateProduct, updateStock, deleteProduct,
  approveProduct, rejectProduct, filterMeta
} from '../controllers/product.controller.js';

const router = Router();

// Public
router.get('/', listProducts); // works anonymously; adapts for staff via optional auth below
router.get('/meta/filters', filterMeta);

// Public detail — optional auth handled inside controller via req.user
router.get('/:id', (req, res, next) => next(), getProduct);

// Seller — only sellers create/edit/stock products. Admin & manager are oversight roles.
router.post('/', authenticateUser, authorizeRoles('SELLER'), upload.array('images', 5), createProduct);
router.put('/:id', authenticateUser, authorizeRoles('SELLER'), upload.array('images', 5), updateProduct);
router.put('/:id/stock', authenticateUser, authorizeRoles('SELLER'), updateStock);
router.delete('/:id', authenticateUser, authorizeRoles('SELLER', 'ADMIN'), deleteProduct);

// Manager / Admin moderation
router.post('/:id/approve', authenticateUser, authorizeRoles('MANAGER', 'ADMIN'), approveProduct);
router.post('/:id/reject', authenticateUser, authorizeRoles('MANAGER', 'ADMIN'), rejectProduct);

export default router;
