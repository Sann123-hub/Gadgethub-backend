import Cart from '../models/Cart.js';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import Complaint from '../models/Complaint.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';

/* ═══════════════ CART ═══════════════ */

const getOrCreateCart = async (userId) => {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
};

const populateCart = (cart) =>
  cart.populate({ path: 'items.product', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] });

/** GET /api/cart */
export const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  await populateCart(cart);
  // Drop items whose product vanished / unapproved
  cart.items = cart.items.filter((i) => i.product && i.product.status === 'APPROVED');
  const itemsTotal = cart.items.reduce((s, i) => s + i.product.price * i.qty, 0);
  ok(res, { cart, itemsTotal });
});

/** POST /api/cart — { productId, qty } */
export const addToCart = asyncHandler(async (req, res) => {
  const { productId, qty = 1 } = req.body;
  const product = await Product.findById(productId);
  if (!product || product.status !== 'APPROVED') throw new ApiError(404, 'Product not available.');
  if (product.stock < 1) throw new ApiError(409, 'This product is out of stock.');

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((i) => String(i.product) === String(productId));
  const newQty = (existing ? existing.qty : 0) + Number(qty);
  if (newQty > product.stock) throw new ApiError(409, `Only ${product.stock} unit(s) available.`);

  if (existing) existing.qty = newQty;
  else cart.items.push({ product: productId, qty: Number(qty) });
  await cart.save();
  await populateCart(cart);
  ok(res, { cart }, 'Added to cart.');
});

/** PUT /api/cart/:productId — { qty } (0 removes) */
export const updateCartItem = asyncHandler(async (req, res) => {
  const qty = Number(req.body.qty);
  const cart = await getOrCreateCart(req.user._id);
  const item = cart.items.find((i) => String(i.product) === String(req.params.productId));
  if (!item) throw new ApiError(404, 'Item not in cart.');

  if (qty <= 0) cart.items = cart.items.filter((i) => i !== item);
  else {
    const product = await Product.findById(item.product);
    if (product && qty > product.stock) throw new ApiError(409, `Only ${product.stock} unit(s) available.`);
    item.qty = qty;
  }
  await cart.save();
  await populateCart(cart);
  ok(res, { cart }, qty <= 0 ? 'Item removed.' : 'Cart updated.');
});

/** DELETE /api/cart/:productId */
export const removeCartItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((i) => String(i.product) !== String(req.params.productId));
  await cart.save();
  ok(res, { cart }, 'Item removed.');
});

/* ═══════════════ WISHLIST ═══════════════ */

const getOrCreateWishlist = async (userId) => {
  let wl = await Wishlist.findOne({ user: userId });
  if (!wl) wl = await Wishlist.create({ user: userId, products: [] });
  return wl;
};

/** GET /api/wishlist */
export const getWishlist = asyncHandler(async (req, res) => {
  const wl = await getOrCreateWishlist(req.user._id);
  await wl.populate({ path: 'products', populate: [{ path: 'brand', select: 'name' }, { path: 'category', select: 'name' }] });
  ok(res, { wishlist: wl.products.filter(Boolean) });
});

/** POST /api/wishlist/:productId — toggle */
export const toggleWishlist = asyncHandler(async (req, res) => {
  const wl = await getOrCreateWishlist(req.user._id);
  const pid = req.params.productId;
  const has = wl.products.some((p) => String(p) === String(pid));
  if (has) {
    wl.products = wl.products.filter((p) => String(p) !== String(pid));
    await wl.save();
    return ok(res, { inWishlist: false }, 'Removed from wishlist.');
  }
  wl.products.push(pid);
  await wl.save();
  ok(res, { inWishlist: true }, 'Saved to wishlist.');
});

/** POST /api/wishlist/:productId/move-to-cart */
export const moveWishlistToCart = asyncHandler(async (req, res) => {
  const wl = await getOrCreateWishlist(req.user._id);
  const pid = req.params.productId;
  if (!wl.products.some((p) => String(p) === String(pid))) throw new ApiError(404, 'Not in your wishlist.');

  const product = await Product.findById(pid);
  if (!product || product.status !== 'APPROVED') throw new ApiError(404, 'Product not available.');
  if (product.stock < 1) throw new ApiError(409, 'Out of stock.');

  const cart = await getOrCreateCart(req.user._id);
  const existing = cart.items.find((i) => String(i.product) === String(pid));
  if (existing) existing.qty = Math.min(existing.qty + 1, product.stock);
  else cart.items.push({ product: pid, qty: 1 });
  await cart.save();

  wl.products = wl.products.filter((p) => String(p) !== String(pid));
  await wl.save();

  ok(res, {}, 'Moved to cart.');
});

/* ═══════════════ REVIEWS ═══════════════ */

/** GET /api/reviews/product/:productId — paginated, approved only (public) */
export const listProductReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 6 });
  const q = { product: req.params.productId, status: 'APPROVED' };

  const [reviews, total] = await Promise.all([
    Review.find(q).populate('user', 'name avatar').sort('-createdAt').skip(skip).limit(limit),
    Review.countDocuments(q)
  ]);
  ok(res, { reviews, ...meta(total) });
});

/** POST /api/reviews — { productId, rating, title, body, image } */
export const createReview = asyncHandler(async (req, res) => {
  const { productId, rating, title, body, image } = req.body;
  const product = await Product.findById(productId);
  if (!product || product.status !== 'APPROVED') throw new ApiError(404, 'Product not found.');

  const existing = await Review.findOne({ product: productId, user: req.user._id });
  if (existing) throw new ApiError(409, 'You have already reviewed this product. Edit your existing review.');

  // Users go live immediately; suspicious patterns can be moderated after
  const review = await Review.create({
    product: productId,
    user: req.user._id,
    rating: Number(rating),
    title,
    body,
    image,
    status: 'APPROVED'
  });
  await Review.syncProductRating(productId);
  ok(res, { review }, 'Review posted. Thanks!', 201);
});

/** PUT /api/reviews/:id — owner only */
export const updateReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  if (String(review.user) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own reviews.');

  ['rating', 'title', 'body', 'image'].forEach((f) => {
    if (req.body[f] !== undefined) review[f] = req.body[f];
  });
  await review.save();
  await Review.syncProductRating(review.product);
  ok(res, { review }, 'Review updated.');
});

/** DELETE /api/reviews/:id — owner, or MANAGER/ADMIN */
export const deleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  const isOwner = String(review.user) === String(req.user._id);
  const canModerate = ['MANAGER', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !canModerate) throw new ApiError(403, 'Not allowed.');

  const pid = review.product;
  await review.deleteOne();
  await Review.syncProductRating(pid);
  ok(res, {}, 'Review deleted.');
});

/** GET /api/reviews/mine */
export const myReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find({ user: req.user._id }).populate('product', 'name image');
  ok(res, { reviews });
});

/* ═══════════════ COMPLAINTS ═══════════════ */

/** POST /api/complaints — user creates */
export const createComplaint = asyncHandler(async (req, res) => {
  const { orderId, subject, message } = req.body;
  const complaint = await Complaint.create({ user: req.user._id, order: orderId, subject, message });
  ok(res, { complaint }, 'Complaint submitted. Our team will follow up.', 201);
});

/** GET /api/complaints/mine */
export const myComplaints = asyncHandler(async (req, res) => {
  const complaints = await Complaint.find({ user: req.user._id }).sort('-createdAt').populate('order', 'invoiceNumber');
  ok(res, { complaints });
});

/** POST /api/reviews/:id/report — flag a review for moderation */
export const reportReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  review.reported = true;
  review.reportedReason = String(req.body?.reason || 'Reported by user').slice(0, 300);
  await review.save();
  ok(res, {}, 'Review reported. Our moderation team will take a look.');
});
