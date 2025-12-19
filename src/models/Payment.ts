import mongoose, { Schema } from 'mongoose';
import { IPayment, PaymentMethod, PaymentStatus } from '../types';
import { generateNumber } from '../utils/helpers';

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: {
      type: String,
      unique: true,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
      required: [true, 'Invoice ID is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    method: {
      type: String,
      enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other'] as PaymentMethod[],
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'] as PaymentStatus[],
      default: 'pending',
    },
    reference: {
      type: String,
      maxlength: 100,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    processedAt: {
      type: Date,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Generate payment number before saving
paymentSchema.pre('save', function (next) {
  if (!this.paymentNumber) {
    this.paymentNumber = generateNumber('PAY');
  }
  next();
});

// Set processedAt when status changes to completed
paymentSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'completed' && !this.processedAt) {
    this.processedAt = new Date();
  }
  next();
});

// Indexes
paymentSchema.index({ paymentNumber: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ method: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
export default Payment;
