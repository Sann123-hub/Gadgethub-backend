import { Router } from 'express';
import { authenticateUser, authorizeRoles, customerOnly } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import {
  getCart, addToCart, updateCartItem, removeCartItem,
  getWishlist, toggleWishlist, moveWishlistToCart,
  listProductReviews, createReview, updateReview, deleteReview, myReviews, reportReview,
  createComplaint, myComplaints
} from '../controllers/shop.controller.js';
import {
  userDashboard, askAdvisor, findUpgrades, buildSetup, mySetups, saveSetup, deleteSetup, compareProducts
} from '../controllers/user.controller.js';

const router = Router();

/* ── Everything below requires a logged-in account ── */
router.use(authenticateUser);

// Cart — mutations are customer-only (staff cannot shop)
router.get('/cart', getCart);
router.post('/cart', customerOnly, addToCart);
router.put('/cart/:productId', customerOnly, updateCartItem);
router.delete('/cart/:productId', customerOnly, removeCartItem);

// Wishlist — saving is fine for anyone, but moving into the cart is customer-only
router.get('/wishlist', getWishlist);
router.post('/wishlist/:productId', toggleWishlist);
router.post('/wishlist/:productId/move-to-cart', customerOnly, moveWishlistToCart);

// Reviews
router.get('/reviews/mine', myReviews);
router.get('/reviews/product/:productId', listProductReviews);
router.post('/reviews', upload.single('image'), createReview);
router.put('/reviews/:id', updateReview);
router.delete('/reviews/:id', deleteReview);
router.post('/reviews/:id/report', reportReview);

// Complaints
router.post('/complaints', createComplaint);
router.get('/complaints/mine', myComplaints);

// User dashboard
router.get('/dashboard', userDashboard);

// Advisor / Upgrade / Setup / Compare
router.post('/advisor', askAdvisor);
router.post('/upgrade-finder', findUpgrades);
router.post('/setup/build', buildSetup);
router.get('/setup', mySetups);
router.post('/setup/save', saveSetup);
router.delete('/setup/:id', deleteSetup);
router.get('/compare', compareProducts);

export default router;
