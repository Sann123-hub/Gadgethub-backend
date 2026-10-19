import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true },
    logo: { type: String, default: '' },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

brandSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  next();
});

const Brand = mongoose.model('Brand', brandSchema);
export default Brand;
