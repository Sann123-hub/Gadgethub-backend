import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    subject: { type: String, required: true, maxlength: 160 },
    message: { type: String, required: true, maxlength: 3000 },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
      default: 'PENDING',
      index: true
    },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    responses: [
      {
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        byRole: String,
        message: String,
        at: { type: Date, default: Date.now }
      }
    ],
    resolvedAt: Date
  },
  { timestamps: true }
);

const Complaint = mongoose.model('Complaint', complaintSchema);
export default Complaint;
