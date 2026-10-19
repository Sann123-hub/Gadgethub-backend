/* ═══════════════════════════════════════════════════════════════
   Shared category helpers — single source of truth for:
   • normalizeCategory()            any label → canonical DB name
   • detectProductCategory()        free text → { category, subcategories }
   • validateComparisonCategory()   compare-session category rule
   • filterProductsByCategory()     in-memory category filter
   Canonical names MUST match the `categories` collection exactly
   (see server/utils/seed.js): Smartphones, Laptops, Computers, TVs,
   Tablets, Smartwatches, Headphones, Speakers, Cameras, Gaming,
   Accessories.
   ═══════════════════════════════════════════════════════════════ */

/** Canonical DB category name → every alias we recognise for it. */
export const CATEGORY_ALIASES = {
  Smartphones: ['smartphone', 'smartphones', 'phone', 'phones', 'mobile', 'mobiles', 'android', 'iphone', 'flagship phone'],
  Laptops: ['laptop', 'laptops', 'notebook', 'notebooks', 'ultrabook', 'ultrabooks', 'macbook', 'macbooks', 'chromebook'],
  Computers: ['computer', 'computers', 'desktop', 'desktops', 'pc', 'pcs', 'gaming pc', 'prebuilt', 'workstation', 'mini pc', 'monitor', 'monitors'],
  TVs: ['tv', 'tvs', 'television', 'televisions', 'smart tv'],
  Tablets: ['tablet', 'tablets', 'ipad', 'ipads', 'tab'],
  Smartwatches: ['smartwatch', 'smartwatches', 'smart watch', 'smartwatch band', 'watch', 'wearable', 'wearables', 'fitness band', 'smart band'],
  Headphones: ['headphone', 'headphones', 'headset', 'headsets', 'earbuds', 'earbud', 'earphones', 'buds', 'tws', 'anc headphones'],
  Speakers: ['speaker', 'speakers', 'soundbar', 'soundbars', 'subwoofer'],
  Cameras: ['camera', 'cameras', 'dslr', 'mirrorless', 'action camera', 'camcorder', 'gopro'],
  Gaming: ['gaming', 'console', 'consoles', 'playstation', 'ps5', 'xbox', 'steam deck', 'controller', 'gamepad', 'handheld'],
  Accessories: ['accessory', 'accessories', 'keyboard', 'keyboards', 'mechanical keyboard', 'mouse', 'mice', 'ssd', 'nvme', 'hdd', 'external ssd', 'power bank', 'charger', 'hub', 'usb hub', 'dock', 'docking station', 'dongle', 'cable', 'cables']
};

/** Order used to resolve conflicts (more "device-like" categories first). */
const DETECT_ORDER = [
  'Smartphones', 'Laptops', 'Computers', 'Tablets', 'Cameras',
  'Headphones', 'Speakers', 'TVs', 'Smartwatches', 'Gaming', 'Accessories'
];

/** Lowercase, strip punctuation, pad with spaces → phrase matching. */
const normalizeText = (text) =>
  ` ${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

/**
 * normalizeCategory("laptops" | "Laptop" | "gaming laptop") → "Laptops"
 * Returns the exact DB category name, or null when unrecognised.
 */
export const normalizeCategory = (name) => {
  const n = normalizeText(name).trim();
  if (!n) return null;

  const entries = Object.entries(CATEGORY_ALIASES);
  // exact alias / canonical match
  for (const [canonical, aliases] of entries) {
    if (n === canonical.toLowerCase() || aliases.includes(n)) return canonical;
  }
  // fall back to substring (e.g. "smart phones", "gaming mouse pad")
  for (const [canonical, aliases] of entries) {
    if ([canonical.toLowerCase(), ...aliases].some((a) => n.includes(a))) return canonical;
  }
  return null;
};

/**
 * detectProductCategory("show me gaming mice under 5000")
 * → { category: 'Accessories', subcategories: ['gaming'], broad: false }
 * Broad queries ("gadgets under 50000") → { category: null, broad: true }
 */
export const detectProductCategory = (text) => {
  const t = normalizeText(text);
  const matched = DETECT_ORDER.filter((cat) =>
    [cat.toLowerCase(), ...CATEGORY_ALIASES[cat]].some((alias) => t.includes(` ${alias} `))
  );

  // "gaming laptop" → Laptops, "gaming mouse" → Accessories:
  // a concrete device word always beats the Gaming / Accessories buckets.
  let pool = matched;
  if (pool.length > 1 && pool.includes('Gaming')) pool = pool.filter((c) => c !== 'Gaming');
  if (pool.length > 1 && pool.includes('Accessories') && pool.some((c) => c !== 'Accessories')) {
    pool = pool.filter((c) => c !== 'Accessories');
  }

  const subcategories = [];
  if (/\bgaming|esports\b/.test(t)) subcategories.push('gaming');
  if (/\bmechanical\b/.test(t)) subcategories.push('mechanical');
  if (/\bwireless\b/.test(t)) subcategories.push('wireless');
  if (/\bnoise cancel|noisecancelling|\banc\b/.test(t)) subcategories.push('anc');

  return { category: pool[0] || null, subcategories, broad: pool.length === 0 };
};

/**
 * Comparison rule: everything in one comparison session must share a category.
 * Returns { ok: true } or { ok: false, message } with a friendly hint.
 */
export const validateComparisonCategory = (lockedCategory, incomingCategory) => {
  const a = normalizeCategory(lockedCategory);
  const b = normalizeCategory(incomingCategory);

  if (!a) return { ok: true }; // nothing locked yet — first product sets it
  if (a === b || !b) return { ok: true }; // same category, or unknown → let DB data decide
  return {
    ok: false,
    message: `You can only compare products from the same category. Please select another ${friendlyCategoryLabel(a)}.`
  };
};

/** Natural display name for messages: "Laptops" → "Laptop", "Accessories" → "accessory". */
export const friendlyCategoryLabel = (category) => {
  const map = {
    Laptops: 'Laptop',
    Smartphones: 'Smartphone',
    Computers: 'Computer',
    Tablets: 'Tablet',
    Smartwatches: 'Smartwatch',
    TVs: 'TV',
    Headphones: 'Headphones',
    Speakers: 'Speaker',
    Cameras: 'Camera',
    Gaming: 'Gaming device',
    Accessories: 'accessory'
  };
  return map[normalizeCategory(category)] || category;
};

/**
 * In-memory filter by canonical category (belt & suspenders on top of the DB query).
 * Works with populated docs (p.category = {_id, name}) or plain names.
 */
export const filterProductsByCategory = (products, category) => {
  const target = normalizeCategory(category);
  if (!target) return products;
  return (products || []).filter((p) => normalizeCategory(p?.category?.name || p?.category) === target);
};

/** Human label for the friendly no-match messages. */
export const categoryNoMatchMessage = (category, budget) => {
  const label = normalizeCategory(category) || 'gadgets';
  if (budget) {
    return `No ${label} were found within your specified budget of ₹${Number(budget).toLocaleString('en-IN')}. Try increasing your budget or changing your requirements.`;
  }
  return `No ${label} were found matching your requirements. Try changing your requirements.`;
};
