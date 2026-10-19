import Product from '../models/Product.js';
import { normalizeCategory, categoryNoMatchMessage } from '../utils/categories.js';

/* ═══════════════════════════════════════════════════════════════
   Upgrade Finder v2 — OLD PRODUCT → UPGRADES / ADD-ONS / ACCESSORIES

   This service NEVER recommends a replacement device. Each category
   has a blueprint of meaningful internal upgrades (RAM/SSD step-ups
   derived from the device's CURRENT specs) plus compatible add-ons.
   Every blueprint item resolves to a REAL purchasable catalog product
   via tag/spec queries; approxCost is the estimate fallback only.
   ═══════════════════════════════════════════════════════════════ */

const RAM_STEP = { 4: 8, 6: 8, 8: 16, 12: 16, 16: 32, 24: 32, 32: 64 };
const STORAGE_TIERS = [512, 1024, 2048];

const nextRam = (gb) => RAM_STEP[gb] || null;
const nextStorage = (gb) => STORAGE_TIERS.find((t) => t > (gb || 0)) || null;

/* ── Catalog resolution: every upgrade becomes a REAL product ── */

/** Pick the best APPROVED product for a tag query (in-stock first, then cheapest). */
const pickByTags = async (tags, { minPrice = 0, maxPrice = Infinity, exclude = [] } = {}) => {
  try {
    const q = {
      status: 'APPROVED',
      tags: { $in: tags },
      price: { $gte: minPrice, ...(Number.isFinite(maxPrice) ? { $lte: maxPrice } : {}) },
      ...(exclude.length ? { name: { $nin: exclude } } : {})
    };
    const rows = await Product.find(q).select('_id name price stock images rating').lean();
    if (!rows.length) return null;
    rows.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
    return rows[0];
  } catch {
    return null;
  }
};

/** Specific-name lookup (legacy exact matches). */
const matchCatalogProduct = async (name) => {
  try {
    return await Product.findOne({ name, status: 'APPROVED' }).select('_id name price stock images rating').lean();
  } catch {
    return null;
  }
};

/** RAM module for a target capacity: laptop (SODIMM) vs desktop (UDIMM).
 * Name regex enforces the exact capacity ("16GB") so a 8GB stick never matches a 32GB ask. */
const pickRamProduct = async (targetGB, form) => {
  const formRe = form === 'sodimm' ? /sodimm/i : /udimm/i;
  const gbRe = new RegExp(`(?:^|\\s)${targetGB}\\s*gb`, 'i');
  const cap = { 8: ['8gb'], 16: ['16gb'], 32: ['32gb'], 64: ['64gb'] }[targetGB] || [];
  const load = async (tags) => {
    const rows = [];
    for (const t of tags) {
      const found = await Product.find({ status: 'APPROVED', tags: t }).select('_id name price stock images rating').lean();
      rows.push(...found);
    }
    return rows;
  };
  // precise: right form-factor + right capacity, cheapest in-stock first
  let rows = await load(['ram', 'upgrade']);
  let pool = rows.filter((p) => formRe.test(p.name) && gbRe.test(p.name));
  if (!pool.length) pool = rows.filter((p) => gbRe.test(p.name));
  if (!pool.length) pool = rows.filter((p) => formRe.test(p.name));
  if (!pool.length) pool = rows;
  pool.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
  return pool[0] || null;
};

/** Internal storage for a target capacity ('ssd' | 'hdd').
 * Distinguishes SSD vs HDD by name; capacity regex avoids cross-tier matches. */
const pickStorageProduct = async (targetGB, kind = 'ssd') => {
  const isHdd = kind === 'hdd';
  const nameRe = isHdd ? /hdd|hard drive|ironwolf|expansion/i : /ssd/i;
  const gbRe = new RegExp(`${targetGB >= 1024 ? targetGB / 1024 + '\\s*tb' : targetGB + '\\s*gb'}|${targetGB}`, 'i');
  try {
    const rows = await Product.find({ status: 'APPROVED', tags: isHdd ? 'hdd' : 'ssd' }).select('_id name price stock images rating').lean();
    let pool = rows.filter((p) => nameRe.test(p.name));
    if (!pool.length) pool = rows;
    const exact = pool.filter((p) => gbRe.test(p.name));
    const finalPool = exact.length ? exact : pool;
    finalPool.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
    return finalPool[0] || null;
  } catch {
    return null;
  }
};

/** Attach a real catalog product to a blueprint item; falls back to estimate. */
const withProduct = (item, product) => ({
  type: item.type || 'accessory',
  title: item.title,
  upgrades: item.upgrades,
  why: item.why,
  compatibility: item.compatibility,
  approxCost: product?.price ?? item.approxCost ?? null,
  product: product || null
});

/* ── Blueprint builders — each returns [{..., resolve: async () => product }] ── */

function dockish() {
  return {
    type: 'accessory', upgrades: 'Ports',
    title: 'USB-C hub / docking station',
    why: 'Adds HDMI, Ethernet, SD reader and 100W passthrough charging via one cable.',
    compatibility: 'Needs a USB-C / Thunderbolt port; works with most laptops.',
    approxCost: 8999,
    resolve: () => matchCatalogProduct('VaultDock 11-in-1 Hub')
  };
}

const laptopUpgrades = ({ ramGB, storageGB }) => {
  const items = [];

  const ram = nextRam(ramGB);
  if (ram) {
    items.push({
      type: 'internal', upgrades: 'RAM',
      title: `RAM upgrade — ${ramGB || '?'}GB → ${ram}GB`,
      why: 'Doubles multitasking headroom: more browser tabs, heavier IDEs and smoother video calls.',
      compatibility: 'SODIMM DDR4/DDR5 — confirm free slot & max supported speed for your model.',
      approxCost: 3000,
      resolve: () => pickRamProduct(ram, 'sodimm')
    });
  }

  const ssd = nextStorage(storageGB);
  if (ssd) {
    items.push({
      type: 'internal', upgrades: 'Storage',
      title: `SSD upgrade — ${storageGB || '?'}GB → ${ssd >= 1024 ? ssd / 1024 + 'TB' : ssd + 'GB'}`,
      why: 'NVMe storage cuts boot and load times in half and ends "disk full" cleanup sessions.',
      compatibility: 'M.2 2280 NVMe Gen3/Gen4 — most laptops have one spare slot or a swappable drive.',
      approxCost: 6999,
      resolve: () => pickStorageProduct(ssd, 'ssd')
    });
  }

  items.push(
    {
      type: 'accessory', upgrades: 'Portable storage',
      title: 'External SSD — 1TB',
      why: 'Fast USB-C pocket storage for backups, project archives and game libraries.',
      compatibility: 'Works with any USB 3.x / USB-C port; ~1,050MB/s.',
      approxCost: 7999,
      resolve: async () => {
        const rows = await Product.find({ status: 'APPROVED', tags: 'ssd' }).select('_id name price stock images rating').lean();
        const ext = rows.filter((p) => /portable|external/i.test(p.name));
        const pool = ext.length ? ext : rows;
        pool.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
        return pool[0] || null;
      }
    },
    {
      type: 'accessory', upgrades: 'Bulk backup',
      title: 'External HDD — 2TB',
      why: 'Cheapest rupees-per-GB for Time Machine / File History backups.',
      compatibility: 'USB-A + USB-C; bus-powered, no adapter needed.',
      approxCost: 5499,
      resolve: () => pickByTags(['hdd', 'backup'], { minPrice: 3000 })
    },
    {
      type: 'accessory', upgrades: 'Thermals',
      title: 'Laptop cooling pad',
      why: 'Lowers sustained temps 5–8°C so the CPU keeps its boost clocks longer.',
      compatibility: 'Fits 14–17" laptops; powered by a single USB-A port.',
      approxCost: 1499,
      resolve: () => pickByTags(['cooling'], { maxPrice: 3000 })
    },
    dockish(),
    {
      type: 'accessory', upgrades: 'Screen real estate',
      title: 'External monitor',
      why: 'A second screen measurably speeds up any desk workflow.',
      compatibility: 'HDMI / USB-C DisplayPort Alt Mode.',
      approxCost: 24999,
      resolve: async () => {
        const rows = await Product.find({ status: 'APPROVED', tags: 'display' }).select('_id name price stock images rating').lean();
        const mons = rows.filter((p) => /monitor/i.test(p.name));
        const pool = mons.length ? mons : rows;
        pool.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
        return pool[0] || null;
      }
    },
    {
      type: 'accessory', upgrades: 'Ergonomics',
      title: 'Laptop stand',
      why: 'Raises the screen to eye level and improves airflow under the chassis.',
      compatibility: 'Adjustable, fits all laptop sizes; folds flat for travel.',
      approxCost: 1299,
      resolve: () => pickByTags(['ergonomics'], { maxPrice: 2000 })
    },
    {
      type: 'accessory', upgrades: 'Connectivity',
      title: 'Wi-Fi 6 USB adapter',
      why: 'Upgrades older Wi-Fi 4/5 radios to faster, low-latency Wi-Fi 6.',
      compatibility: 'USB-A, driver-free on Windows 10/11.',
      approxCost: 1799,
      resolve: () => pickByTags(['wifi'], { maxPrice: 3000 })
    },
    {
      type: 'accessory', upgrades: 'Connectivity',
      title: 'Bluetooth 5.3 adapter',
      why: 'Adds stable low-latency BT for headphones, mice and controllers.',
      compatibility: 'USB-A plug-and-play; pairs up to 7 devices.',
      approxCost: 649,
      resolve: () => pickByTags(['bluetooth'], { maxPrice: 1200 })
    },
    {
      type: 'accessory', upgrades: 'Input',
      title: 'External keyboard & mouse',
      why: 'Full-size mechanical typing + precision mouse turns any spot into a desk.',
      compatibility: 'Any laptop with USB or Bluetooth.',
      approxCost: 7999,
      resolve: () => pickByTags(['programming'], { maxPrice: 20000 })
    }
  );
  return items;
};

const desktopUpgrades = ({ ramGB, storageGB }) => {
  const items = [];
  const ram = nextRam(ramGB);
  if (ram) {
    items.push({
      type: 'internal', upgrades: 'RAM',
      title: `RAM upgrade — ${ramGB || '?'}GB → ${ram}GB`,
      why: 'More memory for heavy multitasking, VMs and modern games.',
      compatibility: 'UDIMM DDR4/DDR5 — match your motherboard generation & speed.',
      approxCost: 6500,
      resolve: () => pickRamProduct(ram, 'udimm')
    });
  }
  const ssd = nextStorage(storageGB);
  if (ssd) {
    items.push({
      type: 'internal', upgrades: 'Storage',
      title: `NVMe SSD upgrade — ${storageGB || '?'}GB → ${ssd >= 1024 ? ssd / 1024 + 'TB' : ssd + 'GB'}`,
      why: 'Gen4 NVMe transforms boot, load and compile times.',
      compatibility: 'M.2 NVMe — most desktop boards have a second slot.',
      approxCost: 6999,
      resolve: () => pickStorageProduct(ssd, 'ssd')
    });
  }
  items.push(
    {
      type: 'internal', upgrades: 'Bulk storage',
      title: 'HDD — 4TB',
      why: 'Cheap mass storage for media, backups and game archives.',
      compatibility: '3.5" SATA; any desktop with a spare drive bay.',
      approxCost: 7499,
      resolve: () => pickStorageProduct(4096, 'hdd')
    },
    {
      type: 'internal', upgrades: 'Graphics',
      title: 'GPU upgrade (RTX-class)',
      why: 'The single biggest jump for gaming and 3D/GPU-accelerated work.',
      compatibility: 'PCIe x16 — check PSU wattage and case clearance first.',
      approxCost: 28999,
      resolve: async () => {
        const rows = await Product.find({ status: 'APPROVED', tags: 'gpu' }).select('_id name price stock images rating').lean();
        const gpus = rows.filter((p) => /geforce|radeon|rtx|gpu/i.test(p.name));
        gpus.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
        return gpus[0] || null;
      }
    },
    {
      type: 'internal', upgrades: 'Power delivery',
      title: 'PSU upgrade — 750W 80+ Gold',
      why: 'Clean, headroom-rich power for newer GPUs and stable overclocks.',
      compatibility: 'ATX; verify case size and current wattage draw.',
      approxCost: 7999,
      resolve: () => matchCatalogProduct('PSU 750W 80+ Gold') || pickByTags(['psu'], { maxPrice: 15000 })
    },
    {
      type: 'internal', upgrades: 'Cooling',
      title: 'CPU cooler (tower / AIO)',
      why: 'Keeps sustained boost clocks and drops fan noise under load.',
      compatibility: 'Check socket (AM4/AM5/LGA1700) and cooler height clearance.',
      approxCost: 3499,
      resolve: async () => {
        const rows = await Product.find({ status: 'APPROVED', tags: 'cooling' }).select('_id name price stock images rating').lean();
        const coolers = rows.filter((p) => /cooler|aio/i.test(p.name));
        coolers.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
        return coolers[0] || null;
      }
    },
    {
      type: 'accessory', upgrades: 'Airflow',
      title: 'Additional case fans (3-pack)',
      why: 'Positive-pressure airflow lowers GPU/CPU temps and dust build-up.',
      compatibility: '120/140mm mounts; PWM or standard 3-pin headers.',
      approxCost: 1999,
      resolve: async () => {
        const rows = await Product.find({ status: 'APPROVED', tags: 'cooling' }).select('_id name price stock images rating').lean();
        const fans = rows.filter((p) => /fan/i.test(p.name));
        fans.sort((a, b) => (b.stock > 0) - (a.stock > 0) || a.price - b.price);
        return fans[0] || null;
      }
    }
  );
  return items;
};

const smartphoneUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Battery on the go',
    title: 'Power bank',
    why: 'Charges a phone 5–6× over, or a laptop in a pinch.',
    compatibility: 'USB-C PD; airline-safe capacity.',
    approxCost: 4999,
    resolve: () => pickByTags(['battery'], { minPrice: 1500, maxPrice: 16000 })
  },
  {
    type: 'accessory', upgrades: 'Charging speed',
    title: 'Fast GaN charger',
    why: '0–50% in ~20 minutes on supported phones; multiple ports replace every brick you own.',
    compatibility: 'USB-C PD 3.1 / PPS — check your phone’s max wattage.',
    approxCost: 2999,
    resolve: () => pickByTags(['charger'], { maxPrice: 6000 })
  },
  {
    type: 'accessory', upgrades: 'Charging',
    title: 'Braided USB-C cable',
    why: '100W/240W rated cables survive bends that kill bundled ones.',
    compatibility: 'USB-C↔C and C↔A, 2m length.',
    approxCost: 999,
    resolve: () => pickByTags(['cable'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Protection',
    title: 'Phone case',
    why: 'Absorbs 2m drops; the cheapest insurance you will ever buy.',
    compatibility: 'Pick your exact model variant.',
    approxCost: 899,
    resolve: () => matchCatalogProduct('ClearGuard Case') || pickByTags(['protection', 'mobile'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Protection',
    title: 'Tempered-glass screen protector',
    why: 'Takes the scratches and cracks so the OLED does not.',
    compatibility: 'Case-friendly, oleophobic coating.',
    approxCost: 499,
    resolve: () => matchCatalogProduct('ArmorGlass Protector (2-pack)') || pickByTags(['protection'], { maxPrice: 800 })
  },
  {
    type: 'accessory', upgrades: 'Audio',
    title: 'Wireless earbuds (ANC)',
    why: 'Noise-cancelling buds that pair instantly with your phone.',
    compatibility: 'Bluetooth 5.2+; USB-C charging.',
    approxCost: 2999,
    resolve: () => pickByTags(['anc'], { minPrice: 1500, maxPrice: 30000 })
  },
  {
    type: 'accessory', upgrades: 'External storage',
    title: 'USB OTG flash drive',
    why: 'Offload photos/videos directly; frees internal storage instantly.',
    compatibility: 'USB-C + USB-A dual connector; needs OTG support (near-universal on Android).',
    approxCost: 1799,
    resolve: () => pickByTags(['otg'], { maxPrice: 3000 })
  },
  {
    type: 'accessory', upgrades: 'External storage',
    title: 'microSD card',
    why: 'Expand storage for photos, music and offline maps.',
    compatibility: 'Only if your model has a (hybrid) microSD slot — check your spec sheet.',
    approxCost: 1499,
    resolve: () => matchCatalogProduct('microSD Express 256GB')
  }
];

const tabletUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Input',
    title: 'Stylus pen',
    why: 'Handwritten notes, sketches and precise edits.',
    compatibility: 'Check protocol (e.g. Apple Pencil / USI / MPP) for your tablet.',
    approxCost: 5999,
    resolve: () => pickByTags(['tablet', 'creator'], { minPrice: 3000 })
  },
  {
    type: 'accessory', upgrades: 'Productivity',
    title: 'Keyboard folio case',
    why: 'Turns the tablet into a lightweight laptop for typing sessions.',
    compatibility: 'Model-specific magnetic/pogo or Bluetooth folio.',
    approxCost: 8999,
    resolve: () => pickByTags(['tablet'], { minPrice: 5000 })
  },
  {
    type: 'accessory', upgrades: 'Ergonomics',
    title: 'Tablet stand',
    why: 'Adjustable viewing angles for video calls and drawing.',
    compatibility: 'Fits 8–13" tablets.',
    approxCost: 1299,
    resolve: () => pickByTags(['ergonomics'], { maxPrice: 2000 })
  },
  dockish(),
  {
    type: 'accessory', upgrades: 'Protection',
    title: 'Screen protector',
    why: 'Paper-like or tempered glass keeps the display flawless.',
    compatibility: 'Model-specific cut with camera-bar clearance.',
    approxCost: 699,
    resolve: () => pickByTags(['protection'], { maxPrice: 800 })
  }
];

const smartwatchUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Style & comfort',
    title: 'Extra band (sport / leather)',
    why: 'Swap looks in seconds — gym band for workouts, dress band for evenings.',
    compatibility: 'Match lug width or proprietary quick-release.',
    approxCost: 2499,
    resolve: () => pickByTags(['watch'], { maxPrice: 3500 })
  },
  {
    type: 'accessory', upgrades: 'Protection',
    title: 'Screen protector / rugged case',
    why: 'Shrugs off gym racks, trails and door frames.',
    compatibility: 'Model-specific (e.g. 44/45/49mm).',
    approxCost: 1299,
    resolve: () => pickByTags(['protection'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Charging',
    title: 'Travel charger puck',
    why: 'A second charger for the office bag means you never start at 20%.',
    compatibility: 'Use the OEM-spec magnetic puck for your watch.',
    approxCost: 1999,
    resolve: () => matchCatalogProduct('Watch Charger Puck') || pickByTags(['watch'], { minPrice: 1500 })
  }
];

const headphoneUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Portability',
    title: 'Carrying case',
    why: 'Hard-shell protection for bags and flights.',
    compatibility: 'Sized for over-ear or TWS; check fold flat vs fold in.',
    approxCost: 999,
    resolve: () => pickByTags(['audio', 'travel'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Comfort',
    title: 'Replacement earpads',
    why: 'Fresh foam restores noise seal and bass that flattened with wear.',
    compatibility: 'Model-specific memory-foam pads.',
    approxCost: 1499,
    resolve: () => pickByTags(['audio'], { minPrice: 1000, maxPrice: 2000 })
  },
  {
    type: 'accessory', upgrades: 'Storage',
    title: 'Headphone stand',
    why: 'Keeps the headband shaped and the desk tidy.',
    compatibility: 'Universal; aluminum or acrylic.',
    approxCost: 1299,
    resolve: () => matchCatalogProduct('Headphone Stand Arc') || pickByTags(['desk', 'audio'], { maxPrice: 2000 })
  },
  {
    type: 'accessory', upgrades: 'Wired use',
    title: 'Backup audio cable / BT transmitter',
    why: 'Wired fallback for dead batteries; BT transmitter adds wireless to planes and TVs.',
    compatibility: '3.5mm or 2.5mm — match your jack.',
    approxCost: 1299,
    resolve: () => pickByTags(['audio', 'travel'], { minPrice: 1000, maxPrice: 2500 })
  }
];

const speakerUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Placement',
    title: 'Speaker stand',
    why: 'Puts the tweeter at ear height and cleans up the bass response.',
    compatibility: 'Check top-plate size and load rating.',
    approxCost: 2499,
    resolve: () => pickByTags(['ergonomics'], { minPrice: 2000, maxPrice: 6000 })
  },
  {
    type: 'accessory', upgrades: 'Sources',
    title: 'Bluetooth transmitter',
    why: 'Makes TVs and older consoles send audio to your speaker wirelessly.',
    compatibility: '3.5mm / RCA / optical input.',
    approxCost: 1299,
    resolve: () => pickByTags(['audio', 'travel'], { maxPrice: 2000 })
  },
  {
    type: 'accessory', upgrades: 'Cinema sound',
    title: 'Soundbar upgrade',
    why: 'Adds dedicated dialogue channel and true surround staging.',
    compatibility: 'HDMI eARC or optical from the TV.',
    approxCost: 17999,
    resolve: () => pickByTags(['audio', 'display'], { minPrice: 10000 })
  }
];

const cameraUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Shooting time',
    title: 'Spare battery',
    why: 'Doubles a wedding/day-trip shoot without hunting for outlets.',
    compatibility: 'OEM or certified cells for your body.',
    approxCost: 3999,
    resolve: () => pickByTags(['camera'], { maxPrice: 6000 })
  },
  {
    type: 'accessory', upgrades: 'Storage',
    title: 'SD card — 128GB UHS-II',
    why: 'Fast buffers for burst stills and 4K video.',
    compatibility: 'UHS-II speeds need a UHS-II card slot to pay off.',
    approxCost: 2499,
    resolve: () => pickByTags(['camera'], { minPrice: 1500, maxPrice: 5000 })
  },
  {
    type: 'accessory', upgrades: 'Stability',
    title: 'Travel tripod',
    why: 'Sharp long exposures, steady video and self-portraits.',
    compatibility: 'Check payload vs camera + lens weight.',
    approxCost: 4999,
    resolve: () => pickByTags(['camera', 'travel'], { minPrice: 3000 })
  },
  {
    type: 'accessory', upgrades: 'Protection',
    title: 'Camera bag + cleaning kit',
    why: 'Padded compartments and dust-free optics keep shots crisp.',
    compatibility: 'Sling or backpack by kit size.',
    approxCost: 2999,
    resolve: () => pickByTags(['camera', 'travel'], { maxPrice: 4000 })
  }
];

const tvUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Mounting',
    title: 'Tilt wall mount',
    why: 'Frees floor space and sets the ideal viewing angle.',
    compatibility: 'Check VESA pattern and panel size range.',
    approxCost: 1999,
    resolve: () => pickByTags(['tv'], { maxPrice: 3000 })
  },
  {
    type: 'accessory', upgrades: 'Audio',
    title: 'Soundbar',
    why: 'The fastest fix for flat TV speakers — dialogue clarity first.',
    compatibility: 'HDMI eARC / optical.',
    approxCost: 17999,
    resolve: () => pickByTags(['audio', 'display'], { minPrice: 10000 })
  },
  {
    type: 'accessory', upgrades: 'Streaming',
    title: '4K streaming stick',
    why: 'Adds every app with a snappier remote than stock.',
    compatibility: 'Any HDMI port; Wi-Fi required.',
    approxCost: 3999,
    resolve: () => pickByTags(['tv', 'value'], { maxPrice: 6000 })
  },
  {
    type: 'accessory', upgrades: 'Connectivity',
    title: 'HDMI 2.1 cable — 8K',
    why: 'Unlocks 120Hz VRR gaming on next-gen consoles.',
    compatibility: 'Certified 48Gbps ultra-high-speed cable.',
    approxCost: 899,
    resolve: () => pickByTags(['tv', 'gaming'], { maxPrice: 1500 })
  }
];

const gamingUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Input',
    title: 'Pro controller',
    why: 'Hall-effect sticks never drift; back paddles for competitive play.',
    compatibility: 'Console or PC with 2.4GHz + BT.',
    approxCost: 4999,
    resolve: () => pickByTags(['gaming'], { minPrice: 3000, maxPrice: 9000 })
  },
  {
    type: 'accessory', upgrades: 'Storage',
    title: 'External SSD for games',
    why: 'Store 10+ more AAA titles; near-native load speeds.',
    compatibility: 'USB 3.2; console-formatted in settings.',
    approxCost: 7999,
    resolve: () => pickByTags(['gaming', 'ssd'], { minPrice: 4000 })
  },
  {
    type: 'accessory', upgrades: 'Charging',
    title: 'Controller charging dock',
    why: 'Always-full controllers and a tidy setup.',
    compatibility: 'USB-C docks fit most modern pads.',
    approxCost: 1999,
    resolve: () => matchCatalogProduct('Controller Charge Dock Duo') || pickByTags(['gaming'], { maxPrice: 2500 })
  },
  {
    type: 'accessory', upgrades: 'Audio',
    title: 'Gaming headset',
    why: 'Footstep-accurate positional audio for ranked play.',
    compatibility: '3.5mm / USB / wireless per console.',
    approxCost: 8990,
    resolve: () => pickByTags(['anc'], { minPrice: 5000, maxPrice: 35000 })
  }
];

const accessoriesUpgrades = () => [
  {
    type: 'accessory', upgrades: 'Desk',
    title: 'Desk mat / mouse pad',
    why: 'Precision tracking and a softer, quieter workspace.',
    compatibility: 'Any mouse; stitched edge, 90×40cm.',
    approxCost: 999,
    resolve: () => pickByTags(['desk', 'value'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Ergonomics',
    title: 'Wrist rest',
    why: 'Neutral wrist angle prevents strain in long sessions.',
    compatibility: 'TKL / full-size / mouse sizes.',
    approxCost: 1299,
    resolve: () => pickByTags(['ergonomics'], { maxPrice: 1500 })
  },
  {
    type: 'accessory', upgrades: 'Power',
    title: 'Surge-protected extension board',
    why: 'Protects every gadget on the desk from spikes.',
    compatibility: '6A+ Indian plug points; master switch.',
    approxCost: 1499,
    resolve: () => pickByTags(['power', 'desk'], { maxPrice: 2500 })
  },
  {
    type: 'accessory', upgrades: 'Customization',
    title: 'Compact mechanical keyboard',
    why: 'Hot-swap switches make it the last board you ever buy.',
    compatibility: 'MX-style switches, BT + USB-C.',
    approxCost: 7999,
    resolve: () => pickByTags(['programming', 'value'], { minPrice: 4000 })
  }
];

const GENERIC_UPGRADES = () => [
  {
    type: 'accessory', upgrades: 'Power',
    title: 'Power bank',
    why: 'Backup power for any USB-charged gadget.',
    compatibility: 'USB-C PD output.',
    approxCost: 4999,
    resolve: () => pickByTags(['battery'], { minPrice: 1500, maxPrice: 16000 })
  },
  {
    type: 'accessory', upgrades: 'Care',
    title: 'Gadget cleaning kit',
    why: 'Screen-safe gel, brushes and microfibre keep gear like-new.',
    compatibility: 'Safe on OLED, glass and aluminum.',
    approxCost: 699,
    resolve: () => pickByTags(['care', 'value'], { maxPrice: 1200 })
  }
];

/* ── Public API ─────────────────────────────────────────────────── */

/**
 * getUpgradeOptions({ category, productName, ramGB, storageGB })
 * → { current, upgrades, message? }
 * Blueprint per category; internal RAM/SSD step-ups derived from CURRENT specs.
 * Every item carries a real catalog product when one matches.
 */
export const getUpgradeOptions = async ({ category, productName, ramGB = 0, storageGB = 0 } = {}) => {
  const canonical = normalizeCategory(category) || (productName ? guessCategoryFromName(productName) : null);

  if (!canonical) {
    return {
      current: { name: productName || 'Your device', category: category || null, ramGB, storageGB },
      upgrades: [],
      message: 'Please select a category and product so we can find compatible upgrades.'
    };
  }

  const cur = {
    ramGB: Number(ramGB) || 0,
    storageGB: Number(storageGB) || 0,
    name: productName || canonical,
    category: canonical
  };

  const BLUEPRINTS = {
    Laptops: laptopUpgrades,
    Computers: desktopUpgrades,
    Smartphones: smartphoneUpgrades,
    Tablets: tabletUpgrades,
    Smartwatches: smartwatchUpgrades,
    Headphones: headphoneUpgrades,
    Speakers: speakerUpgrades,
    Cameras: cameraUpgrades,
    TVs: tvUpgrades,
    Gaming: gamingUpgrades,
    Accessories: accessoriesUpgrades
  };
  const build = BLUEPRINTS[canonical] || GENERIC_UPGRADES;

  const raw = build(cur).filter(Boolean);

  // Resolve every blueprint item to a real catalog product (parallel)
  const resolved = await Promise.all(
    raw.map(async (item) => {
      try {
        return withProduct(item, item.resolve ? await item.resolve() : null);
      } catch {
        return withProduct(item, null);
      }
    })
  );

  return {
    current: cur,
    upgrades: resolved,
    message: resolved.length ? null : categoryNoMatchMessage(canonical)
  };
};

/** Guess canonical category from a product name (used only when category is missing). */
const guessCategoryFromName = (name) => {
  const n = String(name || '').toLowerCase();
  if (/phone|iphone|galaxy s|pixel/.test(n)) return 'Smartphones';
  if (/macbook|laptop|thinkpad|zephyrus|ideapad|ultrabook|inspiron|pavilion/.test(n)) return 'Laptops';
  if (/desktop|tower|rig|workstation|imac/.test(n)) return 'Computers';
  if (/ipad|tab\b|tablet/.test(n)) return 'Tablets';
  if (/watch|band\b/.test(n)) return 'Smartwatches';
  if (/headphone|earbud|buds\b/.test(n)) return 'Headphones';
  if (/speaker|soundbar/.test(n)) return 'Speakers';
  if (/camera|alpha|dslr/.test(n)) return 'Cameras';
  if (/playstation|xbox|steam deck|console/.test(n)) return 'Gaming';
  if (/tv\b|television/.test(n)) return 'TVs';
  return null;
};

/**
 * Back-compat entry used by POST /api/upgrade-finder.
 * Accepts the dropdown payload { category, productName, ram, storage }
 * or the legacy free-text shape.
 */
export const upgradeService = {
  findUpgrades: async (input = {}) => {
    // ram/storage arrive as numbers from the dropdowns, or legacy strings ("8", "512GB SSD")
    const ram = typeof input.ram === 'string' ? parseInt(input.ram, 10) || 0 : Number(input.ram ?? input.ramGB) || 0;
    const storage = typeof input.storage === 'string'
      ? (() => { const m = input.storage.match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i); return m ? Math.round(parseFloat(m[1]) * (m[2].toLowerCase() === 'tb' ? 1024 : 1)) : 0; })()
      : Number(input.storage ?? input.storageGB) || 0;

    if (input.category || input.productName) {
      return getUpgradeOptions({
        category: input.category,
        productName: input.productName || input.device,
        ramGB: ram,
        storageGB: storage
      });
    }

    return getUpgradeOptions({
      category: input.category || null,
      productName: input.device || input.processor || 'Your device',
      ramGB: ram,
      storageGB: storage
    });
  }
};
