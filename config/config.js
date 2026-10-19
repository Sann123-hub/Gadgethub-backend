import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true }); // .env wins over ambient shell env (e.g. CI/desktop shells exporting PORT=0)

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const required = (name, fallback = null) => {
  const v = process.env[name] ?? fallback;
  if (v === null || v === '') {
    // Soft-required: log loudly but don't crash dev environments for optional integrations
    console.warn(`⚠ Missing env var: ${name}`);
  }
  return v;
};

const config = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/gadgethub'),
  jwt: {
    secret: required('JWT_SECRET', 'dev-only-insecure-secret-change-me'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
  },
  email: {
    host: process.env.EMAIL_HOST || '',
    port: Number(process.env.EMAIL_PORT || 465),
    secure: String(process.env.EMAIL_SECURE || 'true') === 'true',
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'Gadget Hub <no-reply@gadgethub.io>'
  },
  seedAdmin: {
    email: process.env.SEED_ADMIN_EMAIL || 'admin@gadgethub.io',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin@1234'
  },
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads')
};

export default config;
