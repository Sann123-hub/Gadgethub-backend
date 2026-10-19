import Product from '../models/Product.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';
import { toCSV, toExcelXML, reportToPDF } from '../services/report.service.js';

/** Guard: product belongs to this seller */
const ownProductOr404 = async (productId, sellerId) => {
  const p = await Product.findById(productId);
  if (!p) throw new ApiError(404, 'Product not found.');
  if (String(p.seller) !== String(sellerId)) throw new ApiError(403, 'This is not your product.');
  return p;
};

/** GET /api/seller/dashboard */
export const sellerDashboard = asyncHandler(async (req, res) => {
  const myProducts = await Product.find({ seller: req.user._id }).select('_id');
  const ids = myProducts.map((p) => p._id);

  const [totalProducts, approved, pending, lowStock, outOfStock] = await Promise.all([
    Product.countDocuments({ seller: req.user._id }),
    Product.countDocuments({ seller: req.user._id, status: 'APPROVED' }),
    Product.countDocuments({ seller: req.user._id, status: 'PENDING' }),
    Product.countDocuments({ seller: req.user._id, stock: { $lte: 5, $gt: 0 } }),
    Product.countDocuments({ seller: req.user._id, stock: 0 })
  ]);

  // Orders containing my products
  const myOrders = await Order.find({ 'items.seller': req.user._id }).sort('-createdAt').limit(10);
  const revenueAgg = await Order.aggregate([
    { $match: { 'items.seller': req.user._id, status: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    { $match: { 'items.seller': req.user._id } },
    { $group: { _id: null, revenue: { $sum: '$items.price' }, units: { $sum: '$items.qty' } } }
  ]);

  // Best sellers
  const bestSellers = await Product.find({ seller: req.user._id, status: 'APPROVED' })
    .sort('-soldCount').limit(5).select('name soldCount price stock rating');

  ok(res, {
    stats: {
      totalProducts, approved, pending, lowStock, outOfStock,
      revenue: revenueAgg[0]?.revenue || 0,
      unitsSold: revenueAgg[0]?.units || 0,
      orderCount: myOrders.length
    },
    recentOrders: myOrders.slice(0, 5),
    bestSellers,
    productIds: ids
  });
});

/** GET /api/seller/orders — paginated orders containing my products */
export const sellerOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = { 'items.seller': req.user._id };
  if (req.query.status) q.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(q).sort('-createdAt').skip(skip).limit(limit).populate('user', 'name email'),
    Order.countDocuments(q)
  ]);

  // Trim items to only this seller's lines
  const trimmed = orders.map((o) => {
    const obj = o.toObject();
    obj.items = obj.items.filter((i) => String(i.seller) === String(req.user._id));
    return obj;
  });
  ok(res, { orders: trimmed, ...meta(total) });
});

/** GET /api/seller/reviews — reviews on my products */
export const sellerReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const myProducts = await Product.find({ seller: req.user._id }).select('_id');
  const q = { product: { $in: myProducts.map((p) => p._id) }, status: 'APPROVED' };

  const [reviews, total] = await Promise.all([
    Review.find(q).populate('user', 'name').populate('product', 'name').sort('-createdAt').skip(skip).limit(limit),
    Review.countDocuments(q)
  ]);
  ok(res, { reviews, ...meta(total) });
});

/** GET /api/seller/analytics?days=30 — sales trend for charts */
export const sellerAnalytics = asyncHandler(async (req, res) => {
  const days = Math.min(365, Number(req.query.days) || 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const trend = await Order.aggregate([
    { $match: { createdAt: { $gte: since }, status: { $ne: 'CANCELLED' }, 'items.seller': req.user._id } },
    { $unwind: '$items' },
    { $match: { 'items.seller': req.user._id } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$items.price' },
        units: { $sum: '$items.qty' }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const byProduct = await Order.aggregate([
    { $match: { status: { $ne: 'CANCELLED' }, 'items.seller': req.user._id } },
    { $unwind: '$items' },
    { $match: { 'items.seller': req.user._id } },
    { $group: { _id: '$items.product', revenue: { $sum: '$items.price' }, units: { $sum: '$items.qty' } } },
    { $sort: { revenue: -1 } },
    { $limit: 8 },
    { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'p' } },
    { $project: { name: { $first: '$p.name' }, revenue: 1, units: 1 } }
  ]);

  ok(res, { days, trend, byProduct });
});

/* ═══════════ REPORTS (PDF / CSV / Excel) ═══════════ */

const collectSellerData = async (sellerId) => {
  const [products, orders] = await Promise.all([
    Product.find({ seller: sellerId }).populate('brand', 'name').populate('category', 'name'),
    Order.find({ 'items.seller': sellerId, status: { $ne: 'CANCELLED' } })
  ]);
  const lines = [];
  orders.forEach((o) => o.items.forEach((i) => { if (String(i.seller) === String(sellerId)) lines.push({ order: o.invoiceNumber, date: o.createdAt, ...i.toObject() }); }));
  return { products, lines };
};

/** GET /api/seller/reports/:kind?format=pdf|csv|excel — kind: sales|products|inventory */
export const sellerReport = asyncHandler(async (req, res) => {
  const { kind, format = 'csv' } = req.params;
  const { products, lines } = await collectSellerData(req.user._id);

  let rows, headers, title, sections;

  if (kind === 'sales') {
    rows = lines;
    headers = [
      { label: 'Invoice', key: 'order' },
      { label: 'Date', key: (r) => new Date(r.date).toLocaleDateString('en-IN') },
      { label: 'Product', key: 'name' },
      { label: 'Qty', key: 'qty' },
      { label: 'Revenue', key: (r) => r.price * r.qty }
    ];
    title = 'Sales Report';
  } else if (kind === 'products') {
    rows = products.map((p) => ({ name: p.name, brand: p.brand?.name, category: p.category?.name, price: p.price, stock: p.stock, sold: p.soldCount, rating: p.rating, status: p.status }));
    headers = [
      { label: 'Product', key: 'name' },
      { label: 'Brand', key: 'brand' },
      { label: 'Category', key: 'category' },
      { label: 'Price', key: 'price' },
      { label: 'Sold', key: 'sold' },
      { label: 'Rating', key: 'rating' },
      { label: 'Status', key: 'status' }
    ];
    title = 'Product Report';
  } else if (kind === 'inventory') {
    rows = products.map((p) => ({ name: p.name, stock: p.stock, price: p.price, status: p.stock === 0 ? 'OUT OF STOCK' : p.stock <= 5 ? 'LOW' : 'OK', value: p.stock * p.price }));
    headers = [
      { label: 'Product', key: 'name' },
      { label: 'Stock', key: 'stock' },
      { label: 'Price', key: 'price' },
      { label: 'Stock state', key: 'status' },
      { label: 'Inventory value', key: 'value' }
    ];
    title = 'Inventory Report';
  } else {
    throw new ApiError(422, 'Report kind must be: sales, products or inventory.');
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-report-${stamp}.csv"`);
    return res.send(toCSV(rows, headers));
  }

  if (format === 'excel') {
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-report-${stamp}.xls"`);
    return res.send(toExcelXML(rows, headers, kind));
  }

  if (format === 'pdf') {
    sections = [{ title, type: 'table', headers: headers.map((h) => h.label), rows: rows.map((r) => headers.map((h) => (typeof h.key === 'function' ? h.key(r) : r[h.key]))) }];
    const pdf = await reportToPDF(`Seller ${title} — ${req.user.name}`, sections);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-report-${stamp}.pdf"`);
    return res.send(pdf);
  }

  throw new ApiError(422, 'Format must be: pdf, csv or excel.');
});
