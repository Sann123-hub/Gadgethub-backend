import mongoose from 'mongoose';

const specSchema = new mongoose.Schema(
  {
    display: String,
    processor: String,
    ram: String,
    storage: String,
    gpu: String,
    battery: String,
    camera: String,
    connectivity: String,
    weight: String,
    os: String,
    warranty: String
  },
  { _id: false }
);

// Numeric extracts used by Upgrade Finder + Advisor scoring
const numericSpecSchema = new mongoose.Schema(
  {
    ramGB: { type: Number, default: 0 },
    storageGB: { type: Number, default: 0 },
    batteryMah: { type: Number, default: 0 },
    benchmark: { type: Number, default: 0 } // 0-100 relative performance score
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 140 },
    slug: { type: String, index: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: [true, 'Brand is required'] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: [true, 'Category is required'] },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    price: { type: Number, required: [true, 'Price is required'], min: 0 },
    originalPrice: { type: Number, default: 0 },
    stock: { type: Number, default: 0, min: 0 },
    tagline: { type: String, default: '', maxlength: 220 },
    description: { type: String, default: '' },

    images: [{ type: String }],
    specs: { type: specSchema, default: () => ({}) },
    numericSpecs: { type: numericSpecSchema, default: () => ({}) },

    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },

    // Approval workflow: only APPROVED shows publicly
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
    statusNote: { type: String, default: '' }, // manager's reject/correction message

    tags: [{ type: String, lowercase: true }],
    isFeatured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

productSchema.virtual('inStock').get(function () {
  return this.stock > 0;
});

productSchema.virtual('discountPercent').get(function () {
  if (!this.originalPrice || this.originalPrice <= this.price) return 0;
  return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
});

productSchema.index({ name: 'text', tagline: 'text', tags: 'text' });
productSchema.index({ price: 1 });
productSchema.index({ rating: -1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
