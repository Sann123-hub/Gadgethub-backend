import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import config from '../config/config.js';

/** Local disk storage under server/uploads — swap for Cloudinary in production */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ok = /^image\/(jpe?g|png|webp|gif|avif)$/.test(file.mimetype);
  if (!ok) return cb(new Error('Only image files are allowed (jpg, png, webp, gif, avif).'));
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});
