import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: { type: String, minlength: [8, 'Password must be at least 8 characters'], select: false },
    googleId: { type: String, default: '' },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
    role: { type: String, enum: ['USER', 'SELLER', 'MANAGER', 'ADMIN'], default: 'USER' },
    phone: { type: String, default: '' },
    avatar: { type: String, default: '' },
    address: {
      line1: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      zip: { type: String, default: '' },
      country: { type: String, default: 'India' }
    },
    isBlocked: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false }
  },
  { timestamps: true }
);

// Hash password before save (only when modified)
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.createPasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(raw).digest('hex');
  this.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
  return raw; // raw token goes in the email link; only hash is stored
};

userSchema.methods.toSafeJSON = function () {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
