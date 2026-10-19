import Product from '../models/Product.js';

const CATEGORY_SLOT_MAP = {
  laptop: ['Laptops'],
  desktop: ['Computers'],
  monitor: ['Computers'],
  phone: ['Smartphones'],
  tablet: ['Tablets'],
  headphones: ['Headphones'],
  speaker: ['Speakers'],
  camera: ['Cameras'],
  tv: ['TVs'],
  keyboard: ['Accessories'],
  mouse: ['Accessories'],
  charger: ['Accessories'],
  watch: ['Smartwatches']
};

// Budget allocation weights per purpose — the remainder flows to the primary slot
const PURPOSE_BLUEPRINT = {
  STUDENT: { primary: 'laptop', slots: [{ slot: 'laptop', w: 0.62 }, { slot: 'headphones', w: 0.12 }, { slot: 'mouse', w: 0.06 }, { slot: 'keyboard', w: 0.1 }, { slot: 'watch', w: 0.1 }] },
  GAMING: { primary: 'laptop', slots: [{ slot: 'laptop', w: 0.58 }, { slot: 'monitor', w: 0.16 }, { slot: 'headphones', w: 0.12 }, { slot: 'mouse', w: 0.07 }, { slot: 'keyboard', w: 0.07 }] },
  OFFICE: { primary: 'laptop', slots: [{ slot: 'laptop', w: 0.55 }, { slot: 'monitor', w: 0.2 }, { slot: 'keyboard', w: 0.1 }, { slot: 'mouse', w: 0.07 }, { slot: 'headphones', w: 0.08 }] },
  PROGRAMMING: { primary: 'laptop', slots: [{ slot: 'laptop', w: 0.68 }, { slot: 'monitor', w: 0.16 }, { slot: 'keyboard', w: 0.09 }, { slot: 'mouse', w: 0.07 }] },
  CONTENT_CREATION: { primary: 'laptop', slots: [{ slot: 'laptop', w: 0.6 }, { slot: 'monitor', w: 0.16 }, { slot: 'camera', w: 0.14 }, { slot: 'headphones', w: 0.1 }] },
  PHOTOGRAPHY: { primary: 'camera', slots: [{ slot: 'camera', w: 0.55 }, { slot: 'laptop', w: 0.3 }, { slot: 'tablet', w: 0.15 }] }
};

const pickForSlot = (products, slot, maxPrice) => {
  const cats = CATEGORY_SLOT_MAP[slot] || [];
  let pool = products.filter((p) => cats.includes(p.category?.name) && p.price <= maxPrice && p.stock > 0);
  if (!pool.length) pool = products.filter((p) => cats.includes(p.category?.name) && p.price <= maxPrice * 1.2);
  if (!pool.length) return null;
  // Prefer higher rating then better value
  pool.sort((a, b) => b.rating - a.rating || a.price - b.price);
  const best = pool[0];
  const alternatives = pool.slice(1, 4);
  return { best, alternatives };
};

export const setupService = {
  /** Build a setup for a purpose + budget across required slots */
  buildSetup: async ({ purpose, budget, slots }) => {
    const blueprint = PURPOSE_BLUEPRINT[purpose] || PURPOSE_BLUEPRINT.OFFICE;
    const wanted = slots?.length ? blueprint.slots.filter((s) => slots.includes(s.slot)) : blueprint.slots;

    const products = await Product.find({ status: 'APPROVED' })
      .populate('brand', 'name')
      .populate('category', 'name')
      .limit(400);

    const items = [];
    const totalWeight = wanted.reduce((s, x) => s + x.w, 0);

    wanted.forEach(({ slot, w }) => {
      const slotBudget = Math.round((budget * w) / totalWeight);
      const pick = pickForSlot(products, slot, slotBudget);
      items.push({
        slot,
        slotBudget,
        selected: pick?.best || null,
        alternatives: pick?.alternatives || [],
        overBudget: pick ? pick.best.price > slotBudget : true
      });
    });

    const total = items.reduce((s, i) => s + (i.selected?.price || 0), 0);
    return {
      purpose,
      budget,
      items,
      total,
      remaining: budget - total,
      withinBudget: total <= budget
    };
  }
};
