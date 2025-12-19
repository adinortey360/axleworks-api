import mongoose, { Schema } from 'mongoose';
import { ISupplier } from '../types';

const supplierSchema = new Schema<ISupplier>(
  {
    name: {
      type: String,
      required: [true, 'Supplier name is required'],
      trim: true,
      maxlength: 200,
    },
    contactPerson: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    alternatePhone: {
      type: String,
      trim: true,
    },
    address: {
      street: { type: String, trim: true, maxlength: 100 },
      city: { type: String, trim: true, maxlength: 50 },
      state: { type: String, trim: true, maxlength: 50 },
      postalCode: { type: String, trim: true, maxlength: 20 },
      country: { type: String, trim: true, maxlength: 50 },
    },
    website: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    paymentTerms: {
      type: String,
      maxlength: 100,
    },
    accountNumber: {
      type: String,
      maxlength: 50,
    },
    taxId: {
      type: String,
      maxlength: 50,
    },
    categories: [{
      type: String,
      enum: ['engine', 'transmission', 'brakes', 'suspension', 'electrical', 'body', 'fluids', 'filters', 'tires', 'accessories', 'other'],
    }],
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      maxlength: 500,
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

// Indexes
supplierSchema.index({ name: 'text', contactPerson: 'text' });
supplierSchema.index({ isActive: 1 });
supplierSchema.index({ categories: 1 });

export const Supplier = mongoose.model<ISupplier>('Supplier', supplierSchema);
export default Supplier;
