import mongoose from 'mongoose';

const setupItemSchema = new mongoose.Schema(
  {
    slot: { type: String, required: true }, // e.g. 'laptop', 'monitor'
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: String,
    price: Number
  },
  { _id: false }
);

const setupSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: 'My Setup' },
    purpose: {
      type: String,
      enum: ['STUDENT', 'GAMING', 'OFFICE', 'PROGRAMMING', 'CONTENT_CREATION', 'PHOTOGRAPHY'],
      required: true
    },
    budget: { type: Number, required: true, min: 0 },
    items: [setupItemSchema],
    total: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const Setup = mongoose.model('Setup', setupSchema);
export default Setup;
