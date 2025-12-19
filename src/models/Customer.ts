import mongoose, { Schema } from 'mongoose';
import { ICustomer, CustomerSource } from '../types';

const customerSchema = new Schema<ICustomer>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    address: {
      street: { type: String, trim: true, maxlength: 100 },
      city: { type: String, trim: true, maxlength: 50 },
      state: { type: String, trim: true, maxlength: 50 },
      postalCode: { type: String, trim: true, maxlength: 20 },
      country: { type: String, trim: true, maxlength: 50 },
    },
    vehicles: [{
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
    }],
    totalSpent: {
      type: Number,
      default: 0,
      min: 0,
    },
    visitCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastVisit: {
      type: Date,
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    tags: [{
      type: String,
      trim: true,
    }],
    source: {
      type: String,
      enum: ['walk-in', 'app', 'referral', 'website'] as CustomerSource[],
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Virtual for full name
customerSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes
customerSchema.index({ phone: 1 });
customerSchema.index({ email: 1 }, { sparse: true });
customerSchema.index({ userId: 1 }, { sparse: true });
customerSchema.index({ firstName: 'text', lastName: 'text', email: 'text', phone: 'text' });
customerSchema.index({ isActive: 1 });
customerSchema.index({ tags: 1 });

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
export default Customer;
