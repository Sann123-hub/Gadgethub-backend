import Order from '../models/Order.js';
import Product from '../models/Product.js';
import Cart from '../models/Cart.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';
import { generateInvoicePDF } from '../services/invoice.service.js';
import { emailService } from '../services/email.service.js';

const GST_RATE = 0.18;

/** POST /api/orders — checkout the user's cart */
export const checkout = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod = 'COD' } = req.body;
  if (!shippingAddress?.fullName || !shippingAddress?.line1 || !shippingAddress?.city || !shippingAddress?.zip) {
    throw new ApiError(422, 'Complete shipping address is required (name, line1, city, zip).');
  }

  const cart = await Cart.findOne({ user: req.user._id }).populate({
    path: 'items.product',
    populate: [{ path: 'brand' }, { path: 'category' }]
  });
  if (!cart || cart.items.length === 0) throw new ApiError(400, 'Your cart is empty.');

  // Validate stock & build snapshots
  const items = [];
  for (const it of cart.items) {
    const p = it.product;
    if (!p || p.status !== 'APPROVED') throw new ApiError(409, 'An item in your cart is no longer available.');
    if (p.stock < it.qty) throw new ApiError(409, `Only ${p.stock} unit(s) of "${p.name}" left.`);

    const gross = p.price * it.qty;
    const discount = Math.round(gross * ((p.discountPercent || 0) / 100));
    const tax = Math.round((gross - discount) * GST_RATE);
    items.push({
      product: p._id,
      name: p.name,
      image: p.images?.[0] || '',
      seller: p.seller,
      price: p.price,
      qty: it.qty,
      discount,
      tax,
      subtotal: gross - discount + tax
    });
  }

  const itemsTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const discountTotal = items.reduce((s, i) => s + i.discount, 0);
  const taxTotal = items.reduce((s, i) => s + i.tax, 0);
  const shippingFee = itemsTotal >= 50000 ? 0 : 499;
  const total = itemsTotal - discountTotal + taxTotal + shippingFee;

  const seq = String((await Order.countDocuments()) + 1).padStart(6, '0');
  const order = await Order.create({
    user: req.user._id,
    items,
    shippingAddress,
    paymentMethod,
    itemsTotal,
    discountTotal,
    taxTotal,
    shippingFee,
    total,
    status: 'CONFIRMED',
    isPaid: paymentMethod !== 'COD',
    invoiceNumber: `GH-${new Date().getFullYear()}-${seq}`,
    statusHistory: [{ status: 'CONFIRMED', at: new Date(), note: 'Order placed' }]
  });

  // Decrement stock + increment soldCount
  await Promise.all(
    items.map((i) =>
      Product.findByIdAndUpdate(i.product, { $inc: { stock: -i.qty, soldCount: i.qty } })
    )
  );

  cart.items = [];
  await cart.save();

  emailService.sendOrderConfirmation(req.user, order);
  ok(res, { order }, 'Order placed successfully.', 201);
});

/** GET /api/orders/all — MANAGER/ADMIN paginated listing of every order */
export const listAllOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 10 });
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.invoiceNumber = rx;
  }

  const [orders, total] = await Promise.all([
    Order.find(q).sort('-createdAt').skip(skip).limit(limit).populate('user', 'name email'),
    Order.countDocuments(q)
  ]);
  ok(res, { orders, ...meta(total) });
});

/** GET /api/orders/mine — paginated */
export const myOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip, meta } = paginate(req, { limit: 8 });
  const q = { user: req.user._id };
  if (req.query.status) q.status = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(q).sort('-createdAt').skip(skip).limit(limit),
    Order.countDocuments(q)
  ]);
  ok(res, { orders, ...meta(total) });
});

/** GET /api/orders/:id — owner, seller-with-items, manager/admin */
export const getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) throw new ApiError(404, 'Order not found.');

  const isOwner = String(order.user._id) === String(req.user._id);
  const hasMyItems = order.items.some((i) => String(i.seller) === String(req.user._id));
  const isStaff = ['MANAGER', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !hasMyItems && !isStaff) throw new ApiError(403, 'Not allowed to view this order.');

  ok(res, { order });
});

/** PUT /api/orders/:id/status — MANAGER/ADMIN set any; SELLER limited to PROCESSING/SHIPPED for own items */
export const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const VALID = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  if (!VALID.includes(status)) throw new ApiError(422, `Status must be one of: ${VALID.join(', ')}.`);

  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) throw new ApiError(404, 'Order not found.');

  if (req.user.role === 'SELLER') {
    const hasMyItems = order.items.some((i) => String(i.seller) === String(req.user._id));
    if (!hasMyItems) throw new ApiError(403, 'This order does not contain your products.');
    if (!['PROCESSING', 'SHIPPED'].includes(status)) throw new ApiError(403, 'Sellers can only mark orders as PROCESSING or SHIPPED.');
  }

  order.status = status;
  order.statusHistory.push({ status, at: new Date(), note });
  if (status === 'DELIVERED') order.isPaid = true;
  if (status === 'CANCELLED') {
    order.cancelledReason = note || '';
    // restock
    await Promise.all(order.items.map((i) => Product.findByIdAndUpdate(i.product, { $inc: { stock: i.qty, soldCount: -i.qty } })));
  }
  await order.save();

  emailService.sendOrderStatusEmail(order.user, order, status);
  ok(res, { order }, `Order marked ${status}.`);
});

/** GET /api/orders/:id/invoice — PDF download (owner or staff) */
export const downloadInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  const isOwner = String(order.user) === String(req.user._id);
  const isStaff = ['MANAGER', 'ADMIN'].includes(req.user.role);
  const hasMyItems = order.items.some((i) => String(i.seller) === String(req.user._id));
  if (!isOwner && !isStaff && !hasMyItems) throw new ApiError(403, 'Not allowed.');

  const pdf = await generateInvoicePDF(order);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${order.invoiceNumber}.pdf"`);
  res.send(pdf);
});
