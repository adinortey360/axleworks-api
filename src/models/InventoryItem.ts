import mongoose, { Schema } from 'mongoose';
import { IInventoryItem, InventoryCategory } from '../types';

const inventoryItemSchema = new Schema<IInventoryItem>(
  {
    partNumber: {
      type: String,
      required: [true, 'Part number is required'],
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: ['engine', 'transmission', 'brakes', 'suspension', 'electrical', 'body', 'fluids', 'filters', 'tires', 'accessories', 'other'] as InventoryCategory[],
      required: [true, 'Category is required'],
    },
    brand: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    minQuantity: {
      type: Number,
      default: 5,
      min: 0,
    },
    maxQuantity: {
      type: Number,
      min: 0,
    },
    unitCost: {
      type: Number,
      required: [true, 'Unit cost is required'],
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: 0,
    },
    location: {
      aisle: { type: String, maxlength: 10 },
      shelf: { type: String, maxlength: 10 },
      bin: { type: String, maxlength: 10 },
    },
    compatibleVehicles: [{
      make: { type: String, maxlength: 50 },
      model: { type: String, maxlength: 50 },
      yearFrom: { type: Number },
      yearTo: { type: Number },
    }],
    barcode: {
      type: String,
      sparse: true,
      maxlength: 50,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastRestockedAt: {
      type: Date,
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

// Virtual for checking if stock is low
inventoryItemSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.minQuantity;
});

// Virtual for stock value
inventoryItemSchema.virtual('stockValue').get(function () {
  return this.quantity * this.unitCost;
});

// Indexes
inventoryItemSchema.index({ partNumber: 1 });
inventoryItemSchema.index({ name: 'text', description: 'text', partNumber: 'text' });
inventoryItemSchema.index({ category: 1 });
inventoryItemSchema.index({ supplierId: 1 });
inventoryItemSchema.index({ quantity: 1, minQuantity: 1 });
inventoryItemSchema.index({ isActive: 1 });
inventoryItemSchema.index({ barcode: 1 }, { sparse: true });

export const InventoryItem = mongoose.model<IInventoryItem>('InventoryItem', inventoryItemSchema);
export default InventoryItem;
