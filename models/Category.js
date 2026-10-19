import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true },
    icon: { type: String, default: '' },
    description: { type: String, default: '' }
  },
  { timestamps: true }
);

categorySchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);
export default Category;
