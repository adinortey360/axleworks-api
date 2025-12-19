import mongoose, { Schema } from 'mongoose';
import { IExpense, ExpenseCategory, PaymentMethod } from '../types';
import { generateNumber } from '../utils/helpers';

const expenseSchema = new Schema<IExpense>(
  {
    expenseNumber: {
      type: String,
      unique: true,
    },
    category: {
      type: String,
      enum: ['parts', 'supplies', 'utilities', 'rent', 'payroll', 'equipment', 'marketing', 'insurance', 'taxes', 'maintenance', 'other'] as ExpenseCategory[],
      required: [true, 'Category is required'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: 200,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now,
    },
    vendor: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'cheque', 'other'] as PaymentMethod[],
    },
    reference: {
      type: String,
      maxlength: 100,
    },
    receiptUrl: {
      type: String,
      maxlength: 500,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringFrequency: {
      type: String,
      enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    },
    taxDeductible: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
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

// Generate expense number before saving
expenseSchema.pre('save', function (next) {
  if (!this.expenseNumber) {
    this.expenseNumber = generateNumber('EXP');
  }
  next();
});

// Indexes
expenseSchema.index({ expenseNumber: 1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ date: -1 });
expenseSchema.index({ supplierId: 1 });
expenseSchema.index({ taxDeductible: 1 });
expenseSchema.index({ createdAt: -1 });

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
export default Expense;
