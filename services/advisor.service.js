import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { detectProductCategory, filterProductsByCategory, categoryNoMatchMessage } from '../utils/categories.js';

/* ═══════════════════════════════════════════════════════════════
   AI Gadget Advisor — CATEGORY-FIRST pipeline

   USER QUERY → detect category → detect budget → detect specs
   → filter DB by CATEGORY FIRST → budget → specs → rank & explain.

   If the user names a category (laptop, mouse, keyboard…), ONLY that
   category is ever returned. Broad queries ("gadgets under ₹50,000")
   may mix categories. The category always comes from the products'
   MongoDB `category` field (populated → {_id, name}), never guessed
   from product names.
   ═══════════════════════════════════════════════════════════════ */

const PURPOSES = {
  STUDENT: { boost: ['battery', 'value', 'student'], keywords: ['student', 'college', 'study', 'notes'] },
  GAMING: { boost: ['gaming', 'gpu'], keywords: ['gaming', 'game', 'fps', 'esports'] },
  OFFICE: { boost: ['office', 'battery', 'display'], keywords: ['office', 'work', 'docs', 'meeting'] },
  PROGRAMMING: { boost: ['programming', 'ram', 'cpu'], keywords: ['programming', 'coding', 'code', 'developer', 'compile'] },
  CONTENT_CREATION: { boost: ['creator', 'gpu', 'display'], keywords: ['content', 'editing', 'video', 'render', 'creator'] },
  PHOTOGRAPHY: { boost: ['camera'], keywords: ['photo', 'photography', 'cinematography'] }
};

const parseBudget = (text) => {
  const m = text.match(/(?:under|below|budget|less than|within|around|upto|up to)\s*(?:₹|rs\.?|inr)?\s*([\d.,]+)\s*(k|lakh|lakhs|l)?/i);
  if (m) {
    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]?.toLowerCase().startsWith('k')) n *= 1000;
    if (m[2]?.toLowerCase().startsWith('l')) n *= 100000;
    return n;
  }
  const lakh = text.match(/([\d.]+)\s*lakh/i);
  if (lakh) return parseFloat(lakh[1]) * 100000;
  const k = text.match(/([\d.]+)\s*k\b/i);
  if (k) return parseFloat(k[1]) * 1000;
  return null;
};

const detectPurpose = (text) => {
  for (const [key, cfg] of Object.entries(PURPOSES)) {
    if (cfg.keywords.some((k) => text.includes(k))) return key;
  }
  return null;
};

/** Extract RAM request e.g. "16GB RAM" */
const parseRam = (text) => {
  const m = text.match(/(\d{1,2})\s*gb\s*ram/i) || text.match(/ram\s*(\d{1,2})/i);
  return m ? parseInt(m[1], 10) : null;
};

export const advisorService = {
  /** Score APPROVED products against a free-text requirement and explain matches */
  getRecommendations: async (queryText, limit = 6) => {
    const q = String(queryText || '').toLowerCase();

    /* STEP 1 — detect category (BEFORE anything touches the DB) */
    const detected = detectProductCategory(q);
    const category = detected.category; // null → broad query, mixing allowed

    /* STEP 2 — budget, STEP 3 — specs & preferences */
    const budget = parseBudget(q);
    const minRam = parseRam(q);
    const purpose = detectPurpose(q);
    const subs = detected.subcategories; // e.g. ['gaming'], ['mechanical']

    const priorityBattery = /battery|endurance|backup/.test(q);
    const priorityPerformance = /performance|fast|powerful|flagship/.test(q);
    const priorityCamera = /camera|photo/.test(q);
    const priorityPortability = /light|portable|travel|slim/.test(q);

    /* STEP 4 — CATEGORY FIRST: resolve canonical name → DB _ids */
    const filter = { status: 'APPROVED' };
    if (category) {
      const catDocs = await Category.find({ name: category }).select('_id');
      filter.category = { $in: catDocs.map((c) => c._id) };
    }

    /* STEP 5 — budget at the DB level too (₹0 wasted rows) */
    if (budget) filter.price = { $lte: budget };
    if (minRam) filter['numericSpecs.ramGB'] = { $gte: minRam };

    let products = await Product.find(filter)
      .populate('brand', 'name')
      .populate('category', 'name')
      .limit(300);

    /* Subcategory tightening: type qualifiers and device words are STRICT —
       "gaming mice under ₹5,000" must return mice only. "Mechanical" is treated
       as a keyboard synonym (common shopping language). Category lock always holds. */
    const strictSubs = subs.filter((s) => s === 'gaming');
    const deviceWord = /\b(mice|mouse)\b/.test(q) ? /mouse|mice/i : /\bkeyboards?\b|mechanical/.test(q) ? /keyboard|keychron/i : null;
    if (strictSubs.length || deviceWord) {
      let tight = products;
      if (strictSubs.length) {
        tight = tight.filter((p) =>
          strictSubs.some((s) => p.tags?.includes(s) || `${p.name} ${p.tagline || ''}`.toLowerCase().includes(s))
        );
      }
      if (deviceWord) {
        // Device word is STRICT: "mice" must be mice, "keyboard" must be a keyboard.
        // Match on NAME only (taglines like "mechanical typing" over-match).
        tight = tight.filter((p) => deviceWord.test(p.name));
      }
      products = tight; // may be empty → honest no-match below
    }

    // Belt & suspenders: in-memory category enforcement on populated docs
    if (category) products = filterProductsByCategory(products, category);

    /* No-match honesty: never substitute other categories for a named one */
    if (!products.length) {
      return {
        recommendations: [],
        parsed: { category, subcategories: subs, budget, minRam, purpose, priorities: { battery: priorityBattery, performance: priorityPerformance, camera: priorityCamera, portability: priorityPortability } },
        message: category
          ? categoryNoMatchMessage(category, budget)
          : 'No gadgets were found matching your requirements. Try changing your requirements or budget.'
      };
    }

    const purposeCfg = purpose ? PURPOSES[purpose] : null;

    const scored = products
      .map((p) => {
        let score = 55;
        const reasons = [];
        const cautions = [];

        // Budget
        if (budget) {
          const headroom = (budget - p.price) / budget;
          score += 18;
          reasons.push(`Fits your ₹${budget.toLocaleString('en-IN')} budget with ₹${(budget - p.price).toLocaleString('en-IN')} to spare`);
          if (headroom > 0.4) cautions.push('You could step up a tier within the same budget');
        }

        // Category confirmation (guaranteed by the filter — surfaced for transparency)
        if (category) reasons.push(`Filtered to ${p.category?.name} from live inventory`);

        // Purpose fit
        if (purposeCfg) {
          purposeCfg.boost.forEach((b) => {
            if (p.tags?.includes(b)) {
              score += 6;
              reasons.push(`Tagged for ${b} — matches this use case`);
            }
          });
        }

        // RAM requirement
        if (minRam && p.numericSpecs?.ramGB >= minRam) {
          score += 10;
          reasons.push(`${p.numericSpecs.ramGB}GB RAM meets your ${minRam}GB requirement`);
        }

        // Priorities
        if (priorityBattery && p.numericSpecs?.batteryMah >= 5000) {
          score += 8;
          reasons.push(`${(p.numericSpecs.batteryMah / 1000).toFixed(1)}Ah-class battery for long endurance`);
        }
        if (priorityPerformance && p.numericSpecs?.benchmark >= 75) {
          score += 8;
          reasons.push(`High benchmark score (${p.numericSpecs.benchmark}/100) for demanding workloads`);
        }
        if (priorityCamera && /camera/i.test(p.specs?.camera || '') && p.category?.name !== 'Headphones') {
          score += 7;
          reasons.push(`Camera system: ${p.specs.camera}`);
        }
        if (priorityPortability && /(\d(?:\.\d+)?)\s*kg/.test(p.specs?.weight || '') && parseFloat(p.specs.weight) < 1.5) {
          score += 6;
          reasons.push(`Light at ${p.specs.weight} — easy to carry`);
        }

        // Reputation
        if (p.rating >= 4.5 && p.numReviews >= 5) {
          score += 5;
          reasons.push(`${p.rating}★ from ${p.numReviews} verified reviews`);
        }
        if (p.stock === 0) {
          score -= 8;
          cautions.push('Currently out of stock');
        }

        return {
          product: p,
          score: Math.max(30, Math.min(98, Math.round(score))),
          reasons: reasons.slice(0, 4),
          cautions: cautions.slice(0, 2),
          purpose
        };
      })
      .sort((a, b) => b.score - a.score)
      /* Broad queries (no category named): keep the mix diverse — cap 2 per category.
         Category-locked queries: straight top-N. */
      .reduce((acc, rec) => {
        if (category) { if (acc.length < limit) acc.push(rec); return acc; }
        const sameCat = acc.filter((r) => r.product?.category?.name === rec.product?.category?.name).length;
        if (sameCat < 2 && acc.length < limit) acc.push(rec);
        return acc;
      }, []);

    return {
      recommendations: scored,
      parsed: { category, subcategories: subs, budget, minRam, purpose, priorities: { battery: priorityBattery, performance: priorityPerformance, camera: priorityCamera, portability: priorityPortability } }
    };
  }
};
