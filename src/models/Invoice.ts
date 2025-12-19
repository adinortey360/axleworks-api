import mongoose, { Schema } from 'mongoose';
import { IInvoice, IInvoiceLineItem, InvoiceStatus } from '../types';
import { generateNumber } from '../utils/helpers';

const invoiceLineItemSchema = new Schema<IInvoiceLineItem>(
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

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
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
    workOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkOrder',
    },
    lineItems: [invoiceLineItemSchema],
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
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },
    amountDue: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'refunded'] as InvoiceStatus[],
      default: 'draft',
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    paymentTerms: {
      type: String,
      maxlength: 100,
    },
    payments: [{
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    }],
    sentAt: Date,
    paidAt: Date,
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

// Generate invoice number before saving
invoiceSchema.pre('save', function (next) {
  if (!this.invoiceNumber) {
    this.invoiceNumber = generateNumber('INV');
  }
  next();
});

// Calculate totals before saving
invoiceSchema.pre('save', function (next) {
  // Calculate subtotal from line items
  this.subtotal = this.lineItems.reduce((sum, item) => sum + item.total, 0);

  // Calculate tax
  this.taxAmount = (this.subtotal - this.discountAmount) * (this.taxRate / 100);

  // Calculate total
  this.total = this.subtotal - this.discountAmount + this.taxAmount;

  // Calculate amount due
  this.amountDue = this.total - this.amountPaid;

  // Update status based on payment
  if (this.amountDue <= 0 && this.status !== 'cancelled' && this.status !== 'refunded') {
    this.status = 'paid';
    if (!this.paidAt) {
      this.paidAt = new Date();
    }
  } else if (this.amountPaid > 0 && this.amountDue > 0) {
    this.status = 'partial';
  }

  next();
});

// Indexes
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ status: 1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index({ createdAt: -1 });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
export default Invoice;
