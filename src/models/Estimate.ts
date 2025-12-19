import mongoose, { Schema } from 'mongoose';
import { IEstimate, IEstimateLineItem, EstimateStatus } from '../types';
import { generateNumber } from '../utils/helpers';

const estimateLineItemSchema = new Schema<IEstimateLineItem>(
  {
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    type: {
      type: String,
      enum: ['part', 'labour', 'service', 'misc'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true }
);

const estimateSchema = new Schema<IEstimate>(
  {
    estimateNumber: {
      type: String,
      unique: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle ID is required'],
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    lineItems: [estimateLineItemSchema],
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'approved', 'rejected', 'expired', 'converted'] as EstimateStatus[],
      default: 'draft',
    },
    validUntil: {
      type: Date,
      required: [true, 'Valid until date is required'],
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    terms: {
      type: String,
      maxlength: 500,
    },
    sentAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    rejectionReason: {
      type: String,
      maxlength: 200,
    },
    convertedToWorkOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkOrder',
    },
    createdBy: {
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

// Generate estimate number before saving
estimateSchema.pre('save', function (next) {
  if (!this.estimateNumber) {
    this.estimateNumber = generateNumber('EST');
  }
  next();
});

// Calculate totals before saving
estimateSchema.pre('save', function (next) {
  // Calculate subtotal from line items
  this.subtotal = this.lineItems.reduce((sum, item) => sum + item.total, 0);

  // Calculate tax
  this.taxAmount = (this.subtotal - this.discountAmount) * (this.taxRate / 100);

  // Calculate total
  this.total = this.subtotal - this.discountAmount + this.taxAmount;

  next();
});

// Indexes
estimateSchema.index({ estimateNumber: 1 });
estimateSchema.index({ status: 1 });
estimateSchema.index({ validUntil: 1 });
estimateSchema.index({ createdAt: -1 });

export const Estimate = mongoose.model<IEstimate>('Estimate', estimateSchema);
export default Estimate;
