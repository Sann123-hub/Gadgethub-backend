import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '', maxlength: 120 },
    body: { type: String, required: [true, 'Review text is required'], maxlength: 2000 },
    image: { type: String, default: '' },

    // Moderation workflow
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING', index: true },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedNote: { type: String, default: '' },
    reported: { type: Boolean, default: false },
    reportedReason: { type: String, default: '' }
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

// Recalculate product rating aggregates after any write
reviewSchema.statics.syncProductRating = async function (productId) {
  const stats = await this.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(productId), status: 'APPROVED' } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
  ]);
  const avg = stats[0]?.avg || 0;
  const count = stats[0]?.count || 0;
  await mongoose.model('Product').findByIdAndUpdate(productId, {
    rating: Math.round(avg * 10) / 10,
    numReviews: count
  });
};

const Review = mongoose.model('Review', reviewSchema);
export default Review;
