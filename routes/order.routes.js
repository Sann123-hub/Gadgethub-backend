import { Router } from 'express';
import { authenticateUser, authorizeRoles, customerOnly } from '../middleware/auth.js';
import { checkout, myOrders, listAllOrders, getOrder, updateOrderStatus, downloadInvoice } from '../controllers/order.controller.js';

const router = Router();

router.use(authenticateUser);

router.post('/', customerOnly, checkout); // only customer (USER) accounts can buy
router.get('/all', authenticateUser, authorizeRoles('MANAGER', 'ADMIN'), listAllOrders);
router.get('/mine', myOrders);
router.get('/:id/invoice', downloadInvoice);
router.get('/:id', getOrder);
router.put('/:id/status', updateOrderStatus); // role rules enforced in controller

export default router;
