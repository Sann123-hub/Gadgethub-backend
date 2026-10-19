import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import config from './config/config.js';
import connectDB from './config/db.js';

import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/product.routes.js';
import shopRoutes from './routes/shop.routes.js';
import orderRoutes from './routes/order.routes.js';
import sellerRoutes from './routes/seller.routes.js';
import adminRoutes from './routes/admin.routes.js';
import { notFound, errorHandler } from './middleware/error.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Ensure uploads dir exists
const uploadsDir = config.uploadsDir;
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Security & parsing ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

// ── CORS ──
const allowedOrigins = [config.frontendUrl, 'http://localhost:3000', 'http://localhost:5173'];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

// ── Global API rate limit (light) ──
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false })
);

// ── Static uploads ──
app.use('/uploads', express.static(uploadsDir));

// ── Health ──
app.get('/api/health', (req, res) => res.json({ success: true, uptime: process.uptime(), env: config.nodeEnv }));

// ── Routes ──
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api', shopRoutes); // /api/cart, /api/wishlist, /api/reviews, /api/advisor, ...
app.use('/api/orders', orderRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api', adminRoutes); // /api/admin/*, /api/manager/*, /api/analytics

// ── Errors ──
app.use(notFound);
app.use(errorHandler);

const PORT = config.port;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Gadget Hub API running on http://localhost:${PORT} (${config.nodeEnv})`);
  });
});

export default app;
