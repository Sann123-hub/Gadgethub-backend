import Order from '../models/Order.js';
import Wishlist from '../models/Wishlist.js';
import Setup from '../models/Setup.js';
import Product from '../models/Product.js';
import { validateComparisonCategory } from '../utils/categories.js';
import { asyncHandler, ok, ApiError, paginate } from '../utils/helpers.js';
import { advisorService } from '../services/advisor.service.js';
import { upgradeService } from '../services/upgrade.service.js';
import { setupService } from '../services/setup.service.js';

/** GET /api/user/dashboard — consolidated user stats */
export const userDashboard = asyncHandler(async (req, res) => {
  const [orders, delivered, pending, wishlist] = await Promise.all([
    Order.countDocuments({ user: req.user._id }),
    Order.countDocuments({ user: req.user._id, status: 'DELIVERED' }),
    Order.countDocuments({ user: req.user._id, status: { $in: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'] } }),
    Wishlist.findOne({ user: req.user._id })
  ]);
  const spend = await Order.aggregate([
    { $match: { user: req.user._id, status: { $ne: 'CANCELLED' } } },
    { $group: { _id: null, total: { $sum: '$total' } } }
  ]);
  const recent = await Order.find({ user: req.user._id }).sort('-createdAt').limit(5);

  ok(res, {
    stats: {
      totalOrders: orders,
      delivered,
      inProgress: pending,
      wishlistCount: wishlist?.products?.length || 0,
      totalSpend: spend[0]?.total || 0
    },
    recentOrders: recent
  });
});

/* ═══════════ AI ADVISOR ═══════════ */

/** POST /api/advisor — { query } */
export const askAdvisor = asyncHandler(async (req, res) => {
  const { query } = req.body;
  if (!query?.trim()) throw new ApiError(422, 'Tell us what you need.');
  const result = await advisorService.getRecommendations(query);
  ok(res, result);
});

/* ═══════════ UPGRADE FINDER ═══════════ */

/** POST /api/upgrade-finder — OLD device → upgrade/accessory options.
 * Accepts the dropdown payload { category, productName, ram, storage }
 * (ram/storage may be numbers or strings like "8" / "512GB SSD")
 * and stays compatible with the legacy free-text shape.
 */
export const findUpgrades = asyncHandler(async (req, res) => {
  const { category, productName, device, processor, ram, storage, ramGB, storageGB } = req.body;
  if (!category && !productName && !processor && !ram) {
    throw new ApiError(422, 'Select a category and product to find upgrades.');
  }

  const result = await upgradeService.findUpgrades({
    category,
    productName,
    device,
    processor,
    ram: ram ?? ramGB,
    storage: storage ?? storageGB
  });
  ok(res, result);
});

/* ═══════════ BUILD YOUR SETUP ═══════════ */

/** POST /api/setup/build — { purpose, budget, slots? } */
export const buildSetup = asyncHandler(async (req, res) => {
  const { purpose, budget, slots } = req.body;
  if (!purpose || !budget) throw new ApiError(422, 'Purpose and budget are required.');
  const setup = await setupService.buildSetup({ purpose, budget: Number(budget), slots });
  ok(res, { setup });
});

/** GET /api/setup — saved setups */
export const mySetups = asyncHandler(async (req, res) => {
  const setups = await Setup.find({ user: req.user._id }).sort('-createdAt').populate('items.product', 'name image price');
  ok(res, { setups });
});

/** POST /api/setup/save — persist a built setup */
export const saveSetup = asyncHandler(async (req, res) => {
  const { name, purpose, budget, items } = req.body;
  if (!purpose || !budget || !items?.length) throw new ApiError(422, 'Purpose, budget and items are required.');

  const mapped = items
    .filter((i) => i.product)
    .map((i) => ({ slot: i.slot, product: i.product._id || i.product, name: i.selected?.name || i.name, price: i.price ?? i.selected?.price }));

  const total = mapped.reduce((s, i) => s + (i.price || 0), 0);
  const setup = await Setup.create({
    user: req.user._id,
    name: name || `${purpose.replace('_', ' ')} setup`,
    purpose,
    budget: Number(budget),
    items: mapped,
    total,
    remaining: Number(budget) - total
  });
  ok(res, { setup }, 'Setup saved.', 201);
});

/** DELETE /api/setup/:id */
export const deleteSetup = asyncHandler(async (req, res) => {
  const setup = await Setup.findById(req.params.id);
  if (!setup) throw new ApiError(404, 'Setup not found.');
  if (String(setup.user) !== String(req.user._id)) throw new ApiError(403, 'Not your setup.');
  await setup.deleteOne();
  ok(res, {}, 'Setup deleted.');
});

/* ═══════════ COMPARE (uses product ids client sends) ═══════════ */

/** GET /api/compare?ids=id1,id2,id3
 * Backend enforcement of the comparison rule: every product in one
 * comparison must share the same category. The first id sets the session
 * category; a different-category id is rejected with 409 and a friendly
 * message (dynamic for ALL categories).
 */
export const compareProducts = asyncHandler(async (req, res) => {
  const { ids } = req.query;
  if (!ids) throw new ApiError(422, 'Provide product ids to compare.');
  const idList = String(ids).split(',').slice(0, 4);
  const products = await Product.find({ _id: { $in: idList }, status: 'APPROVED' })
    .populate('brand', 'name')
    .populate('category', 'name')
    .sort({ name: 1 });

  // Order the results to match the caller's id order (default $in order is arbitrary)
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const ordered = idList.map((id) => byId.get(String(id))).filter(Boolean);

  // Category-lock validation on the server (id params can never be trusted)
  let locked = null;
  for (const p of ordered) {
    const catName = p.category?.name || String(p.category || '');
    const verdict = validateComparisonCategory(locked, catName);
    if (!verdict.ok) {
      throw new ApiError(409, verdict.message);
    }
    locked = catName;
  }

  ok(res, { products: ordered, category: locked });
});
