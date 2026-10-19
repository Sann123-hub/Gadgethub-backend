import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';

const POPULATE = [
  { path: 'brand', select: 'name slug' },
  { path: 'category', select: 'name slug' },
  { path: 'seller', select: 'name email' }
];

/** GET /api/products — public, server-side pagination + search + filter + sort */
export const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req);
  const { search, category, brand, minPrice, maxPrice, rating, inStock, sort, status } = req.query;

  const q = {};

  // Public sees only APPROVED; staff can request other statuses
  const isStaff = ['SELLER', 'MANAGER', 'ADMIN'].includes(req.user?.role);
  if (isStaff && status) {
    q.status = status;
    if (status === 'REJECTED' && req.user.role === 'SELLER') q.seller = req.user._id;
  } else if (isStaff && req.query.mine === 'true' && req.user.role === 'SELLER') {
    q.seller = req.user._id;
  } else {
    q.status = 'APPROVED';
  }

  // Search: name / brand name / category name / tags
  if (search) {
    const brandDocs = await Brand.find({ name: new RegExp(search, 'i') }).select('_id');
    const catDocs = await Category.find({ name: new RegExp(search, 'i') }).select('_id');
    q.$or = [
      { name: new RegExp(search, 'i') },
      { tagline: new RegExp(search, 'i') },
      { tags: new RegExp(search, 'i') },
      ...(brandDocs.length ? [{ brand: { $in: brandDocs.map((b) => b._id) } }] : []),
      ...(catDocs.length ? [{ category: { $in: catDocs.map((c) => c._id) } }] : [])
    ];
  }

  if (category) {
    // Accept slug ("laptops"), name in any case ("Laptops", "LAPTOPS"), or ObjectId
    const safe = String(category).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cat =
      (await Category.findOne({
        $or: [{ slug: String(category).toLowerCase() }, { name: new RegExp(`^${safe}$`, 'i') }]
      }).catch(() => null)) ||
      (await Category.findById(category).catch(() => null));
    if (cat) q.category = cat._id;
  }
  if (brand) {
    // Accept slug, name in any case, or ObjectId (FilterPanel sends brand names)
    const safeB = String(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const b =
      (await Brand.findOne({
        $or: [{ slug: String(brand).toLowerCase() }, { name: new RegExp(`^${safeB}$`, 'i') }]
      }).catch(() => null)) ||
      (await Brand.findById(brand).catch(() => null));
    if (b) q.brand = b._id;
  }
  if (minPrice || maxPrice) {
    q.price = {};
    if (minPrice) q.price.$gte = Number(minPrice);
    if (maxPrice) q.price.$lte = Number(maxPrice);
  }
  if (rating) q.rating = { $gte: Number(rating) };
  if (inStock === 'true') q.stock = { $gt: 0 };

  const SORTS = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1, numReviews: -1 },
    newest: { createdAt: -1 },
    popularity: { soldCount: -1, views: -1 }
  };
  const sortSpec = SORTS[sort] || SORTS.popularity;

  const [products, total] = await Promise.all([
    Product.find(q).populate(POPULATE).sort(sortSpec).skip(skip).limit(limit),
    Product.countDocuments(q)
  ]);

  ok(res, { products, ...meta(total) });
});

/** GET /api/products/:id — public detail (increments views) */
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate(POPULATE);
  if (!product) throw new ApiError(404, 'Product not found.');
  if (product.status !== 'APPROVED') {
    const isOwner = req.user && String(product.seller?._id) === String(req.user._id);
    const isStaff = ['MANAGER', 'ADMIN'].includes(req.user?.role);
    if (!isOwner && !isStaff) throw new ApiError(404, 'Product not found.');
  }
  Product.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).catch(() => {});
  ok(res, { product });
});

/** Shared create/update body → model fields */
const buildBody = async (body) => {
  const out = {};
  ['name', 'tagline', 'description', 'price', 'originalPrice', 'stock', 'images', 'specs', 'numericSpecs', 'tags', 'isFeatured'].forEach((f) => {
    if (body[f] !== undefined) out[f] = body[f];
  });
  if (body.brand) {
    const b = await Brand.findById(body.brand);
    if (!b) throw new ApiError(400, 'Unknown brand.');
    out.brand = b._id;
  }
  if (body.category) {
    const c = await Category.findById(body.category);
    if (!c) throw new ApiError(400, 'Unknown category.');
    out.category = c._id;
  }
  return out;
};

/** POST /api/products — SELLER (creates PENDING) or ADMIN (auto-APPROVED) */
export const createProduct = asyncHandler(async (req, res) => {
  const body = await buildBody(req.body);
  const product = await Product.create({
    ...body,
    seller: req.user._id,
    status: req.user.role === 'ADMIN' ? 'APPROVED' : 'PENDING'
  });
  ok(res, { product }, req.user.role === 'ADMIN' ? 'Product created.' : 'Product submitted for approval.', 201);
});

/** PUT /api/products/:id/stock — inventory-only update; never resets approval status */
export const updateStock = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');

  const isOwner = String(product.seller) === String(req.user._id);
  const canModerate = ['MANAGER', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !canModerate) throw new ApiError(403, 'You can only update stock for your own products.');

  const stock = Number(req.body?.stock);
  if (!Number.isInteger(stock) || stock < 0) throw new ApiError(422, 'Stock must be a non-negative integer.');
  product.stock = stock;
  await product.save();
  ok(res, { product }, `Stock updated to ${stock} units.`);
});

/** PUT /api/products/:id — seller owns it OR manager/admin */
export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');

  const isOwner = String(product.seller) === String(req.user._id);
  const canModerate = ['MANAGER', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !canModerate) throw new ApiError(403, 'You can only edit your own products.');

  const body = await buildBody(req.body);

  // Sellers editing an approved/rejected product push it back to PENDING for re-approval
  if (isOwner && !canModerate && product.status !== 'PENDING') {
    product.status = 'PENDING';
    product.statusNote = '';
  }

  // Only managers/admins may set status directly
  if (canModerate && req.body.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(req.body.status)) {
    product.status = req.body.status;
    product.statusNote = req.body.statusNote || '';
  }

  Object.assign(product, body);
  await product.save();
  ok(res, { product }, 'Product updated.');
});

/** DELETE /api/products/:id — seller owns it OR admin */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'Product not found.');

  const isOwner = String(product.seller) === String(req.user._id);
  if (!isOwner && req.user.role !== 'ADMIN') throw new ApiError(403, 'You can only delete your own products.');

  await product.deleteOne();
  ok(res, {}, 'Product deleted.');
});

/** POST /api/products/:id/approve — MANAGER/ADMIN */
export const approveProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('seller', 'name email');
  if (!product) throw new ApiError(404, 'Product not found.');
  product.status = 'APPROVED';
  product.statusNote = '';
  await product.save();
  ok(res, { product }, `"${product.name}" approved.`);
});

/** POST /api/products/:id/reject — MANAGER/ADMIN with note */
export const rejectProduct = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const product = await Product.findById(req.params.id).populate('seller', 'name email');
  if (!product) throw new ApiError(404, 'Product not found.');
  product.status = 'REJECTED';
  product.statusNote = note || 'Does not meet marketplace guidelines.';
  await product.save();
  ok(res, { product }, 'Product rejected.');
});

/** GET /api/products/meta/filters — public facet lists for the filter sidebar */
export const filterMeta = asyncHandler(async (req, res) => {
  const [categories, brands, priceRange] = await Promise.all([
    Category.find().sort('name'),
    Brand.find().sort('name'),
    Product.aggregate([
      { $match: { status: 'APPROVED' } },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
    ])
  ]);
  ok(res, {
    categories,
    brands,
    priceRange: { min: priceRange[0]?.min || 0, max: priceRange[0]?.max || 300000 }
  });
});
