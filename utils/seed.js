/* Seed script — creates demo users, categories, brands and a rich catalog.
   Run: npm run seed  */
import mongoose from 'mongoose';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import config from '../config/config.js';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const IMG = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

const categories = [
  'Smartphones', 'Laptops', 'Computers', 'TVs', 'Tablets',
  'Smartwatches', 'Headphones', 'Speakers', 'Cameras', 'Gaming', 'Accessories'
];

const brands = ['Aetheria', 'Nexus', 'Sony', 'Samsung', 'ASUS', 'Lenovo', 'Anker', 'Logitech', 'Keychron', 'Valve', 'Fujifilm', 'Garmin'];

const products = [
  { name: 'Aetheria Phone 17 Pro', brand: 'Aetheria', category: 'Smartphones', price: 134999, originalPrice: 149999, stock: 24, tagline: 'A19 Pro titanium flagship with 5x periscope.', image: IMG('photo-1592750475338-74b7b21085ab'), specs: { display: '6.3" XDR OLED 120Hz', processor: 'A19 Pro', ram: '12GB', storage: '256GB', gpu: 'A19 Pro 6-core', battery: '4600mAh', camera: '48MP triple + 5x tele', connectivity: '5G, Wi-Fi 7', os: 'AetherOS 19', warranty: '1 year' }, numericSpecs: { ramGB: 12, storageGB: 256, batteryMah: 4600, benchmark: 96 }, tags: ['flagship', 'camera', 'performance'] },
  { name: 'Nexus Nova Ultra S26', brand: 'Nexus', category: 'Smartphones', price: 124999, originalPrice: 139999, stock: 30, tagline: '200MP camera, S-Pen, Snapdragon 8 Gen 5.', image: IMG('photo-1610945265064-0e34e5519bbf'), specs: { display: '6.8" AMOLED 2X 120Hz', processor: 'Snapdragon 8 Gen 5', ram: '16GB', storage: '512GB', gpu: 'Adreno 840', battery: '5200mAh', camera: '200MP quad', os: 'Android 16', warranty: '1 year' }, numericSpecs: { ramGB: 16, storageGB: 512, batteryMah: 5200, benchmark: 95 }, tags: ['camera', 'battery', 'performance'] },
  { name: 'Spectra Pixel 10 Pro', brand: 'Sony', category: 'Smartphones', price: 99999, originalPrice: 109999, stock: 18, tagline: 'Tensor G5 computational photography king.', image: IMG('photo-1598327105666-5b89351aff97'), specs: { display: '6.7" OLED 120Hz', processor: 'Tensor G5', ram: '16GB', storage: '256GB', battery: '5050mAh', camera: '50MP triple', os: 'Android 16', warranty: '1 year' }, numericSpecs: { ramGB: 16, storageGB: 256, batteryMah: 5050, benchmark: 88 }, tags: ['camera', 'value'] },
  { name: 'Orbit Neo 5G', brand: 'Nexus', category: 'Smartphones', price: 22999, originalPrice: 25999, stock: 50, tagline: 'Flagship-killer under 25K with 120Hz AMOLED.', image: IMG('photo-1510557880182-3d4d3cba35a5'), specs: { display: '6.67" AMOLED 120Hz', processor: 'Dimensity 8400', ram: '8GB', storage: '128GB', battery: '5500mAh', camera: '50MP OIS', os: 'Android 15', warranty: '1 year' }, numericSpecs: { ramGB: 8, storageGB: 128, batteryMah: 5500, benchmark: 72 }, tags: ['value', 'battery'] },
  { name: 'MacBook Pro M4 Max Studio', brand: 'Aetheria', category: 'Laptops', price: 249999, originalPrice: 269999, stock: 12, tagline: 'M4 Max 16-core creator powerhouse.', image: IMG('photo-1517336714731-489689fd1ca8'), specs: { display: '16.2" XDR 120Hz', processor: 'Apple M4 Max', ram: '64GB', storage: '1TB', gpu: '40-core GPU', battery: '100Wh 22h', os: 'macOS', weight: '2.14kg', warranty: '1 year' }, numericSpecs: { ramGB: 64, storageGB: 1024, benchmark: 100 }, tags: ['creator', 'performance', 'programming'] },
  { name: 'ROG Zephyrus G16 RTX 4090', brand: 'ASUS', category: 'Laptops', price: 219999, originalPrice: 239999, stock: 9, tagline: 'Core Ultra 9 + RTX 4090 gaming beast.', image: IMG('photo-1603302576837-37561b2e2302'), specs: { display: '16" OLED 240Hz', processor: 'Core Ultra 9 185H', ram: '32GB', storage: '2TB', gpu: 'RTX 4090 16GB', battery: '90Wh', os: 'Windows 11 Pro', weight: '1.85kg', warranty: '2 years' }, numericSpecs: { ramGB: 32, storageGB: 2048, benchmark: 98 }, tags: ['gaming', 'gpu', 'performance'] },
  { name: 'ThinkPad X1 Carbon Gen 12', brand: 'Lenovo', category: 'Laptops', price: 154999, originalPrice: 174999, stock: 15, tagline: 'Carbon-fiber business ultrabook.', image: IMG('photo-1588872657578-7efd1f1555ed'), specs: { display: '14" 2.8K OLED', processor: 'Core Ultra 7 155H', ram: '32GB', storage: '1TB', battery: '57Wh', weight: '1.09kg', os: 'Windows 11 Pro', warranty: '3 years' }, numericSpecs: { ramGB: 32, storageGB: 1024, benchmark: 82 }, tags: ['office', 'portable'] },
  { name: 'Vertex Air 14 Ultrabook', brand: 'Lenovo', category: 'Laptops', price: 64999, originalPrice: 74999, stock: 28, tagline: 'Budget OLED ultrabook with Ryzen 7.', image: IMG('photo-1496181133206-80ce942886bc'), specs: { display: '14" 2.8K OLED 90Hz', processor: 'Ryzen 7 8845HS', ram: '16GB', storage: '512GB', battery: '75Wh', weight: '1.19kg', os: 'Windows 11', warranty: '1 year' }, numericSpecs: { ramGB: 16, storageGB: 512, benchmark: 78 }, tags: ['value', 'student', 'portable'] },
  { name: 'Titan Rig X RTX 5080 Desktop', brand: 'Aetheria', category: 'Computers', price: 279999, originalPrice: 309999, stock: 6, tagline: 'Ryzen 9 + RTX 5080 prebuilt tower.', image: IMG('photo-1587202372775-e229f172b9d7'), specs: { processor: 'Ryzen 9 9950X', ram: '64GB DDR5', storage: '2TB NVMe', gpu: 'RTX 5080 16GB', os: 'Windows 11 Pro', warranty: '2 years' }, numericSpecs: { ramGB: 64, storageGB: 2048, benchmark: 100 }, tags: ['gaming', 'gpu'] },
  { name: 'Studio Mini M4 Pro', brand: 'Aetheria', category: 'Computers', price: 189999, originalPrice: 199999, stock: 10, tagline: 'Silent M4 Pro mini workstation.', image: IMG('photo-1591488320449-011701bb6704'), specs: { processor: 'Apple M4 Pro', ram: '24GB', storage: '512GB', gpu: '20-core GPU', os: 'macOS', warranty: '1 year' }, numericSpecs: { ramGB: 24, storageGB: 512, benchmark: 94 }, tags: ['creator', 'office'] },
  { name: 'LumenView 32 4K Monitor', brand: 'ASUS', category: 'Computers', price: 54999, originalPrice: 62999, stock: 22, tagline: '32" 4K 144Hz with USB-C 90W.', image: IMG('photo-1527443224154-c4a3942d3acf'), specs: { display: '32" 4K IPS 144Hz', connectivity: 'USB-C 90W, HDMI 2.1', warranty: '2 years' }, numericSpecs: { benchmark: 60 }, tags: ['display', 'office'] },
  { name: 'CineMax 65 QD-OLED TV', brand: 'Samsung', category: 'TVs', price: 189999, originalPrice: 219999, stock: 8, tagline: '65" QD-OLED 165Hz cinema TV.', image: IMG('photo-1593359677879-a4bb92f829d1'), specs: { display: '65" QD-OLED 4K 165Hz', connectivity: '4x HDMI 2.1', warranty: '2 years' }, numericSpecs: { benchmark: 70 }, tags: ['display', 'gaming'] },
  { name: 'GrandView 55 Mini-LED TV', brand: 'Samsung', category: 'TVs', price: 79999, originalPrice: 94999, stock: 14, tagline: '1344-zone Mini-LED, 2000 nits.', image: IMG('photo-1461151304267-38535e780c79'), specs: { display: '55" Mini-LED 4K 120Hz', warranty: '2 years' }, numericSpecs: { benchmark: 55 }, tags: ['display', 'value'] },
  { name: 'AuraBeam 43 Smart TV', brand: 'Sony', category: 'TVs', price: 24999, originalPrice: 31999, stock: 35, tagline: 'Bedroom-size Google TV.', image: IMG('photo-1587829741301-dc798b83add3'), specs: { display: '43" FHD 60Hz', os: 'Google TV', warranty: '1 year' }, numericSpecs: { benchmark: 30 }, tags: ['value'] },
  { name: 'iPad Pro 13 Tandem OLED', brand: 'Aetheria', category: 'Tablets', price: 129999, originalPrice: 139999, stock: 16, tagline: 'M4 chip, 5.1mm thin.', image: IMG('photo-1544244015-0df4b3ffc6b0'), specs: { display: '13" Tandem OLED 120Hz', processor: 'Apple M4', ram: '16GB', storage: '512GB', os: 'iPadOS', warranty: '1 year' }, numericSpecs: { ramGB: 16, storageGB: 512, benchmark: 95 }, tags: ['creator', 'student'] },
  { name: 'Galaxy Tab S10 Ultra', brand: 'Samsung', category: 'Tablets', price: 108999, originalPrice: 122999, stock: 12, tagline: '14.6" AMOLED with S-Pen.', image: IMG('photo-1561154464-82e9adf32764'), specs: { display: '14.6" AMOLED 120Hz', processor: 'Dimensity 9300+', ram: '12GB', storage: '256GB', os: 'Android 15', warranty: '1 year' }, numericSpecs: { ramGB: 12, storageGB: 256, benchmark: 85 }, tags: ['student', 'battery'] },
  { name: 'Watch Ultra 2 Titanium', brand: 'Aetheria', category: 'Smartwatches', price: 89999, originalPrice: 94999, stock: 20, tagline: '3000-nit dive-ready adventure watch.', image: IMG('photo-1508685096489-7aacd43bd3b1'), specs: { display: '49mm OLED 3000 nits', battery: '36h (72h low power)', warranty: '1 year' }, numericSpecs: { batteryMah: 564, benchmark: 60 }, tags: ['battery'] },
  { name: 'Fenix 8 Solar', brand: 'Garmin', category: 'Smartwatches', price: 94999, originalPrice: 99999, stock: 9, tagline: '29-day battery multisport watch.', image: IMG('photo-1523275335684-37898b6baf30'), specs: { display: '1.4" AMOLED sapphire', battery: '29 days', warranty: '2 years' }, numericSpecs: { batteryMah: 500, benchmark: 50 }, tags: ['battery', 'endurance'] },
  { name: 'Pulse Fit 3 Band', brand: 'Nexus', category: 'Smartwatches', price: 4499, originalPrice: 5999, stock: 60, tagline: '21-day AMOLED fitness band.', image: IMG('photo-1575311373937-040b8e1fd5b6'), specs: { display: '1.62" AMOLED', battery: '21 days', warranty: '1 year' }, numericSpecs: { batteryMah: 300, benchmark: 20 }, tags: ['value', 'battery'] },
  { name: 'Sony WH-1000XM5', brand: 'Sony', category: 'Headphones', price: 26999, originalPrice: 34990, stock: 40, tagline: 'Benchmark ANC with 30h battery.', image: IMG('photo-1505740420928-5e560c06d30e'), specs: { battery: '30h ANC on', connectivity: 'BT 5.2 LDAC', warranty: '1 year' }, numericSpecs: { batteryMah: 1200, benchmark: 50 }, tags: ['anc', 'travel', 'value'] },
  { name: 'AirPods Pro 2 USB-C', brand: 'Aetheria', category: 'Headphones', price: 22999, originalPrice: 24900, stock: 45, tagline: 'Adaptive audio with H2 chip.', image: IMG('photo-1600294037681-c80b4cb5b434'), specs: { battery: '6h (30h case)', connectivity: 'BT 5.3', warranty: '1 year' }, numericSpecs: { batteryMah: 523, benchmark: 45 }, tags: ['anc', 'ecosystem'] },
  { name: 'EchoBuds Air 4', brand: 'Nexus', category: 'Headphones', price: 2999, originalPrice: 4499, stock: 80, tagline: 'Budget ANC buds, 50h total.', image: IMG('photo-1590658268037-6bf12165a8df'), specs: { battery: '10h (50h case)', warranty: '1 year' }, numericSpecs: { batteryMah: 480, benchmark: 25 }, tags: ['value', 'battery'] },
  { name: 'HomePod Spatial 2', brand: 'Aetheria', category: 'Speakers', price: 29900, originalPrice: 32900, stock: 25, tagline: 'Room-sensing spatial smart speaker.', image: IMG('photo-1543512214-318c7553f230'), specs: { connectivity: 'Wi-Fi, Thread', warranty: '1 year' }, numericSpecs: { benchmark: 40 }, tags: ['audio'] },
  { name: 'BoomCell 3 Waterproof', brand: 'Nexus', category: 'Speakers', price: 3999, originalPrice: 5999, stock: 55, tagline: 'IP67 party speaker, 24h.', image: IMG('photo-1608043152269-423dbba4e7e1'), specs: { battery: '24h', waterResistance: 'IP67', warranty: '1 year' }, numericSpecs: { batteryMah: 4800, benchmark: 25 }, tags: ['value', 'battery', 'audio'] },
  { name: 'Sonora 5.1 Soundbar', brand: 'Sony', category: 'Speakers', price: 44999, originalPrice: 54999, stock: 18, tagline: 'Dolby Atmos with wireless sub.', image: IMG('photo-1545454675-3531b543be5d'), specs: { audio: '5.1.2ch 520W', connectivity: 'eARC, BT', warranty: '2 years' }, numericSpecs: { benchmark: 45 }, tags: ['audio', 'display'] },
  { name: 'Sony Alpha 7 IV', brand: 'Sony', category: 'Cameras', price: 209999, originalPrice: 229990, stock: 7, tagline: '33MP full-frame hybrid camera.', image: IMG('photo-1516035069371-29a1b244cc32'), specs: { camera: '33MP Exmor R', video: '4K 60p 10-bit', weight: '658g', warranty: '2 years' }, numericSpecs: { benchmark: 90 }, tags: ['camera', 'creator'] },
  { name: 'Fujifilm X-T5', brand: 'Fujifilm', category: 'Cameras', price: 169999, originalPrice: 184999, stock: 8, tagline: '40MP retro-styled flagship APS-C.', image: IMG('photo-1502920917128-1aa500764cbd'), specs: { camera: '40MP X-Trans 5 HR', video: '6.2K 30p', weight: '557g', warranty: '2 years' }, numericSpecs: { benchmark: 85 }, tags: ['camera', 'value'] },
  { name: 'InstaFrame X3 360', brand: 'Anker', category: 'Cameras', price: 34999, originalPrice: 39999, stock: 15, tagline: '5.7K 360 action camera.', image: IMG('photo-1526170375885-4d8ecf77b99f'), specs: { camera: 'Dual 48MP', video: '5.7K 360', warranty: '1 year' }, numericSpecs: { benchmark: 55 }, tags: ['camera', 'travel'] },
  { name: 'PlayStation 5 Pro', brand: 'Sony', category: 'Gaming', price: 68999, originalPrice: 72999, stock: 15, tagline: '2TB PSSR ray-tracing console.', image: IMG('photo-1606813907291-d86efa9b94db'), specs: { storage: '2TB SSD', gpu: 'RDNA 3 16.7 TFLOPs', warranty: '1 year' }, numericSpecs: { storageGB: 2048, benchmark: 97 }, tags: ['gaming', 'gpu'] },
  { name: 'Steam Deck OLED 1TB', brand: 'Valve', category: 'Gaming', price: 54999, originalPrice: 59999, stock: 20, tagline: 'HDR OLED handheld gaming PC.', image: IMG('photo-1550745165-9bc0b252726f'), specs: { display: '7.4" OLED 90Hz', processor: 'AMD APU Zen 2', ram: '16GB', storage: '1TB', battery: '50Wh', warranty: '1 year' }, numericSpecs: { ramGB: 16, storageGB: 1024, benchmark: 75 }, tags: ['gaming', 'travel'] },
  { name: 'HaloPad Elite Controller', brand: 'Valve', category: 'Gaming', price: 6999, originalPrice: 8999, stock: 40, tagline: 'Hall-effect anti-drift controller.', image: IMG('photo-1592840496694-26d035b52b48'), specs: { battery: '30h', connectivity: '2.4GHz + BT', warranty: '1 year' }, numericSpecs: { benchmark: 20 }, tags: ['gaming', 'value'] },
  { name: 'Keychron Q1 Pro', brand: 'Keychron', category: 'Accessories', price: 18999, originalPrice: 21999, stock: 30, tagline: 'CNC aluminum hot-swap mechanical.', image: IMG('photo-1595225476474-87563907a212'), specs: { battery: '300h RGB off', connectivity: 'BT 5.1 + USB-C', warranty: '1 year' }, numericSpecs: { batteryMah: 4000, benchmark: 20 }, tags: ['programming', 'value'] },
  { name: 'MX Master 3S', brand: 'Logitech', category: 'Accessories', price: 9995, originalPrice: 10995, stock: 70, tagline: '8K DPI ergonomic productivity mouse.', image: IMG('photo-1615663245857-ac93bb7c39e7'), specs: { battery: '70 days', connectivity: 'Bolt + BT', warranty: '1 year' }, numericSpecs: { benchmark: 15 }, tags: ['office', 'value'] },
  { name: 'Anker Prime 250W Power Bank', brand: 'Anker', category: 'Accessories', price: 14999, originalPrice: 17999, stock: 35, tagline: '27,650mAh with smart display.', image: IMG('photo-1609091839311-d5365f9ff1c5'), specs: { battery: '27,650mAh', connectivity: '2x USB-C 140W', warranty: '2 years' }, numericSpecs: { batteryMah: 27650, benchmark: 20 }, tags: ['travel', 'battery'] },
  { name: 'HyperGaN 140W Charger', brand: 'Anker', category: 'Accessories', price: 4999, originalPrice: 6499, stock: 90, tagline: '3-port GaN laptop charger.', image: IMG('photo-1583863788434-e58a36330cf0'), specs: { connectivity: '2x USB-C PD + USB-A', warranty: '18 months' }, numericSpecs: { benchmark: 10 }, tags: ['value', 'travel'] },
  { name: 'AeroGlide Pro Mouse', brand: 'Logitech', category: 'Accessories', price: 5499, originalPrice: 6999, stock: 50, tagline: '49g wireless esports mouse.', image: IMG('photo-1527814050087-3793815479db'), specs: { battery: '90h', connectivity: '2.4GHz + BT', warranty: '2 years' }, numericSpecs: { benchmark: 15 }, tags: ['gaming', 'value'] },
  { name: 'VaultDock 11-in-1 Hub', brand: 'Anker', category: 'Accessories', price: 8999, originalPrice: 10999, stock: 45, tagline: 'Dual 4K60 HDMI USB-C dock.', image: IMG('photo-1625842268584-8f3296236761'), specs: { connectivity: '2x HDMI, 100W PD, 2.5GbE', warranty: '18 months' }, numericSpecs: { benchmark: 10 }, tags: ['office', 'value'] }
];

const run = async () => {
  await mongoose.connect(config.mongoUri);
  console.log('✓ Connected. Seeding…');

  await Promise.all([User.deleteMany(), Category.deleteMany(), Brand.deleteMany(), Product.deleteMany()]);

  // Users — one per role
  const usersData = [
    { name: 'Site Admin', email: config.seedAdmin.email, password: config.seedAdmin.password, role: 'ADMIN', avatar: 'https://i.pravatar.cc/200?img=12' },
    { name: 'Mira Kapoor', email: 'manager@gadgethub.io', password: 'Manager@123', role: 'MANAGER', avatar: 'https://i.pravatar.cc/200?img=32' },
    { name: 'TechVault Store', email: 'seller@gadgethub.io', password: 'Seller@123', role: 'SELLER', avatar: 'https://i.pravatar.cc/200?img=52' },
    { name: 'SoundHouse', email: 'seller2@gadgethub.io', password: 'Seller@123', role: 'SELLER', avatar: 'https://i.pravatar.cc/200?img=68' },
    { name: 'Alex Vance', email: 'user@gadgethub.io', password: 'User@1234', role: 'USER', avatar: 'https://i.pravatar.cc/200?img=15' }
  ];
  const users = await User.create(usersData);
  const [admin, , seller1, seller2] = users;

  const cats = await Category.create(categories.map((name) => ({ name })));
  const brandDocs = await Brand.create(brands.map((name) => ({ name })));
  const catMap = new Map(cats.map((c) => [c.name, c._id]));
  const brandMap = new Map(brandDocs.map((b) => [b.name, b._id]));

  const docs = products.map((p, idx) => ({
    ...p,
    brand: brandMap.get(p.brand),
    category: catMap.get(p.category),
    seller: idx % 3 === 0 ? seller2._id : seller1._id,
    status: 'APPROVED',
    images: [p.image],
    tags: p.tags || [],
    soldCount: Math.floor(Math.random() * 40),
    views: Math.floor(Math.random() * 400),
    rating: Math.round((3.9 + Math.random()) * 10) / 10,
    numReviews: Math.floor(Math.random() * 120) + 3
  }));

  await Product.create(docs);
  console.log(`✓ Seeded ${users.length} users, ${cats.length} categories, ${brandDocs.length} brands, ${docs.length} products.`);
  console.log('  Logins: admin@gadgethub.io/Admin@1234 • manager@gadgethub.io/Manager@123 • seller@gadgethub.io/Seller@123 • user@gadgethub.io/User@1234');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
