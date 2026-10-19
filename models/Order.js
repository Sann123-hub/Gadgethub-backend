import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    image: { type: String, default: '' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    price: { type: Number, required: true }, // unit price snapshot
    qty: { type: Number, required: true, min: 1 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    subtotal: { type: Number, required: true } // price*qty - discount + tax
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [orderItemSchema],

    shippingAddress: {
      fullName: String,
      phone: String,
      line1: String,
      city: String,
      state: String,
      zip: String,
      country: String
    },

    paymentMethod: { type: String, enum: ['COD', 'CARD', 'UPI', 'NETBANKING'], default: 'COD' },
    paymentResult: { id: String, status: String, paidAt: Date },

    itemsTotal: { type: Number, required: true }, // sum of price*qty
    taxTotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    shippingFee: { type: Number, default: 0 },
    total: { type: Number, required: true },

    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
      default: 'PENDING',
      index: true
    },
    statusHistory: [{ status: String, at: Date, note: String }],

    invoiceNumber: { type: String, unique: true },
    isPaid: { type: Boolean, default: false },
    cancelledReason: { type: String, default: '' }
  },
  { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);
export default Order;
