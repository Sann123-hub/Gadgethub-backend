import User from '../models/User.js';
import Product from '../models/Product.js';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import Complaint from '../models/Complaint.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';
import { emailService } from '../services/email.service.js';

/* ═══════════════ USERS (ADMIN) ═══════════════ */

/** GET /api/admin/users — paginated + search + role filter */
export const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = {};
  if (req.query.search) {
    const rx = new RegExp(req.query.search, 'i');
    q.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (req.query.role) q.role = req.query.role;
  if (req.query.blocked === 'true') q.isBlocked = true;

  const [users, total] = await Promise.all([
    User.find(q).sort('-createdAt').skip(skip).limit(limit),
    User.countDocuments(q)
  ]);
  ok(res, { users: users.map((u) => u.toSafeJSON()), ...meta(total) });
});

/** PUT /api/admin/users/:id/role */
export const changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const VALID = ['USER', 'SELLER', 'MANAGER', 'ADMIN'];
  if (!VALID.includes(role)) throw new ApiError(422, `Role must be one of ${VALID.join(', ')}.`);

  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');
  if (target.role === 'ADMIN' && req.user._id.toString() !== target._id.toString() && role !== 'ADMIN') {
    throw new ApiError(403, 'Admin accounts cannot be demoted by other admins.');
  }
  target.role = role;
  await target.save();
  ok(res, { user: target.toSafeJSON() }, `Role updated to ${role}.`);
});

/** PUT /api/admin/users/:id/block */
export const toggleBlockUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');
  if (target.role === 'ADMIN' && target._id.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Admin accounts cannot be blocked.');
  }
  target.isBlocked = !target.isBlocked;
  await target.save();
  ok(res, { user: target.toSafeJSON() }, target.isBlocked ? 'User blocked.' : 'User unblocked.');
});

/** DELETE /api/admin/users/:id */
export const deleteUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, 'User not found.');
  if (target.role === 'ADMIN') throw new ApiError(403, 'Admin accounts cannot be deleted.');
  await target.deleteOne();
  ok(res, {}, 'User deleted.');
});

/** PUT /api/admin/managers/:id/disable — soft block manager */
export const toggleManager = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target || target.role !== 'MANAGER') throw new ApiError(404, 'Manager not found.');
  target.isBlocked = !target.isBlocked;
  await target.save();
  ok(res, { user: target.toSafeJSON() }, target.isBlocked ? 'Manager disabled.' : 'Manager enabled.');
});

/* ═══════════════ MANAGER — approvals & moderation ═══════════════ */

/** POST /api/admin/managers — create a dedicated manager account */
export const createManager = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) throw new ApiError(422, 'Name, email and password are required.');
  if (String(password).length < 8) throw new ApiError(422, 'Password must be at least 8 characters.');
  const exists = await User.findOne({ email: String(email).toLowerCase() });
  if (exists) throw new ApiError(409, 'An account with this email already exists.');
  const manager = await User.create({ name, email, password, role: 'MANAGER' });
  ok(res, { user: manager.toSafeJSON() }, 'Manager account created.', 201);
});

/** GET /api/manager/products?status=PENDING — paginated */
export const managerProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = {};
  if (req.query.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status)) q.status = req.query.status;
  else q.status = 'PENDING';

  const [products, total] = await Promise.all([
    Product.find(q).populate(POP).sort('-createdAt').skip(skip).limit(limit),
    Product.countDocuments(q)
  ]);
  ok(res, { products, ...meta(total) });
});

const POP = [
  { path: 'brand', select: 'name' },
  { path: 'category', select: 'name' },
  { path: 'seller', select: 'name email' }
];

/** GET /api/manager/reviews — moderation queue */
export const managerReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = {};
  if (req.query.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status)) q.status = req.query.status;
  if (req.query.reported === 'true') q.reported = true;

  const [reviews, total] = await Promise.all([
    Review.find(q).populate('user', 'name email').populate('product', 'name').sort('-createdAt').skip(skip).limit(limit),
    Review.countDocuments(q)
  ]);
  ok(res, { reviews, ...meta(total) });
});

/** PUT /api/manager/reviews/:id/moderate — { status, note } */
export const moderateReview = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) throw new ApiError(422, 'Invalid moderation status.');
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  review.status = status;
  review.moderatedBy = req.user._id;
  review.moderatedNote = note || '';
  await review.save();
  await Review.syncProductRating(review.product);
  ok(res, { review }, `Review ${status.toLowerCase()}.`);
});

/** DELETE /api/manager/reviews/:id */
export const managerDeleteReview = asyncHandler(async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  const pid = review.product;
  await review.deleteOne();
  await Review.syncProductRating(pid);
  ok(res, {}, 'Review removed.');
});

/** POST /api/reviews/:id/report — user reports a review */
export const reportReview = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const review = await Review.findById(req.params.id);
  if (!review) throw new ApiError(404, 'Review not found.');
  review.reported = true;
  review.reportedReason = reason || 'Reported by user';
  await review.save();
  ok(res, {}, 'Review reported for moderation.');
});

/* ═══════════════ COMPLAINTS ═══════════════ */

/** GET /api/manager/complaints */
export const listComplaints = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = {};
  if (req.query.status && ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'].includes(req.query.status)) q.status = req.query.status;

  const [complaints, total] = await Promise.all([
    Complaint.find(q).populate('user', 'name email').populate('order', 'invoiceNumber').sort('-createdAt').skip(skip).limit(limit),
    Complaint.countDocuments(q)
  ]);
  ok(res, { complaints, ...meta(total) });
});

/** PUT /api/manager/complaints/:id — { status, message } */
export const updateComplaint = asyncHandler(async (req, res) => {
  const { status, message } = req.body;
  const VALID = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'];
  if (status && !VALID.includes(status)) throw new ApiError(422, `Status must be one of ${VALID.join(', ')}.`);

  const complaint = await Complaint.findById(req.params.id).populate('user', 'name email');
  if (!complaint) throw new ApiError(404, 'Complaint not found.');

  if (status) {
    complaint.status = status;
    complaint.assignedTo = req.user._id;
    if (status === 'RESOLVED') complaint.resolvedAt = new Date();
    complaint.responses.push({ by: req.user._id, byRole: req.user.role, message: message || `Status set to ${status}` });
  } else if (message) {
    complaint.responses.push({ by: req.user._id, byRole: req.user.role, message });
  }
  await complaint.save();

  if (status === 'RESOLVED' || status === 'REJECTED') emailService.sendComplaintResolvedEmail(complaint.user, complaint);
  ok(res, { complaint }, 'Complaint updated.');
});

/* ═══════════════ SELLER MONITORING (MANAGER) ═══════════════ */

/** GET /api/manager/sellers — seller list w/ product & revenue stats */
export const sellerMonitoring = asyncHandler(async (req, res) => {
  const sellers = await User.aggregate([
    { $match: { role: 'SELLER' } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'seller',
        as: 'products'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        isBlocked: 1,
        createdAt: 1,
        productCount: { $size: '$products' },
        approvedCount: { $size: { $filter: { input: '$products', cond: { $eq: ['$$this.status', 'APPROVED'] } } } },
        pendingCount: { $size: { $filter: { input: '$products', cond: { $eq: ['$$this.status', 'PENDING'] } } } },
        lowStockCount: { $size: { $filter: { input: '$products', cond: { $lte: ['$$this.stock', 5] } } } }
      }
    },
    { $sort: { productCount: -1 } }
  ]);

  const revenueBySeller = await Order.aggregate([
    { $unwind: '$items' },
    { $group: { _id: '$items.seller', revenue: { $sum: '$items.price' }, units: { $sum: '$items.qty' } } }
  ]);
  const revMap = new Map(revenueBySeller.map((r) => [String(r._id), r]));

  const result = sellers.map((s) => ({
    ...s,
    revenue: revMap.get(String(s._id))?.revenue || 0,
    unitsSold: revMap.get(String(s._id))?.units || 0
  }));

  ok(res, { sellers: result });
});

/* ═══════════════ MANAGER/ADMIN INVENTORY ═══════════════ */

/** GET /api/manager/inventory — all products w/ stock status */
export const inventoryOverview = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 15 });
  const q = {};
  if (req.query.lowStock === 'true') q.stock = { $lte: 5 };

  const [products, total] = await Promise.all([
    Product.find(q).populate(POP).sort({ stock: 1 }).skip(skip).limit(limit),
    Product.countDocuments(q)
  ]);
  ok(res, { products, ...meta(total) });
});

/* ═══════════════ CATEGORIES & BRANDS (ADMIN) ═══════════════ */

/** POST /api/admin/categories */
export const createCategory = asyncHandler(async (req, res) => {
  const cat = await Category.create({ name: req.body.name, description: req.body.description });
  ok(res, { category: cat }, 'Category created.', 201);
});
export const updateCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!cat) throw new ApiError(404, 'Category not found.');
  ok(res, { category: cat }, 'Category updated.');
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const cat = await Category.findById(req.params.id);
  if (!cat) throw new ApiError(404, 'Category not found.');
  const inUse = await Product.countDocuments({ category: cat._id });
  if (inUse > 0) throw new ApiError(409, `${inUse} products use this category. Reassign them first.`);
  await cat.deleteOne();
  ok(res, {}, 'Category deleted.');
});

/** POST /api/admin/brands */
export const createBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.create({ name: req.body.name, description: req.body.description });
  ok(res, { brand }, 'Brand created.', 201);
});
export const updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!brand) throw new ApiError(404, 'Brand not found.');
  ok(res, { brand }, 'Brand updated.');
});
export const deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw new ApiError(404, 'Brand not found.');
  const inUse = await Product.countDocuments({ brand: brand._id });
  if (inUse > 0) throw new ApiError(409, `${inUse} products use this brand.`);
  await brand.deleteOne();
  ok(res, {}, 'Brand deleted.');
});

/** GET /api/admin/stats — dashboard cards */
export const adminStats = asyncHandler(async (req, res) => {
  const [users, sellers, managers, products, pendingProducts, orders, complaints] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'SELLER' }),
    User.countDocuments({ role: 'MANAGER' }),
    Product.countDocuments(),
    Product.countDocuments({ status: 'PENDING' }),
    Order.countDocuments(),
    Complaint.countDocuments({ status: { $in: ['PENDING', 'IN_PROGRESS'] } })
  ]);
  const revenue = await Order.aggregate([
    { $match: { status: { $ne: 'CANCELLED' } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);
  ok(res, {
    stats: { users, sellers, managers, products, pendingProducts, orders, openComplaints: complaints, revenue: revenue[0]?.total || 0 }
  });
});

/* ═══════════════ ANALYTICS (MANAGER+ADMIN) ═══════════════ */

/** GET /api/analytics?days=30 */
export const platformAnalytics = asyncHandler(async (req, res) => {
  const { salesAnalytics } = await import('../services/report.service.js');
  const days = Math.min(365, Number(req.query.days) || 30);
  const data = await salesAnalytics(days);
  ok(res, { ...data, days });
});
