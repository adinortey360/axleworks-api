import mongoose, { Schema } from 'mongoose';
import { IInspectionHistory, IInspectionItem, InspectionStatus, InspectionItemCondition } from '../types';
import { generateNumber } from '../utils/helpers';

const inspectionItemSchema = new Schema<IInspectionItem>(
  {
    name: {
      type: String,
      required: true,
      maxlength: 100,
    },
    category: {
      type: String,
      required: true,
      maxlength: 50,
    },
    condition: {
      type: String,
      enum: ['good', 'fair', 'poor', 'critical', 'not_applicable'] as InspectionItemCondition[],
      required: true,
    },
    notes: {
      type: String,
      maxlength: 200,
    },
    photos: [String],
    requiresAttention: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const inspectionHistorySchema = new Schema<IInspectionHistory>(
  {
    inspectionNumber: {
      type: String,
      unique: true,
    },
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle ID is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    workOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkOrder',
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    type: {
      type: String,
      enum: ['pre_service', 'post_service', 'multi_point', 'safety', 'emissions', 'pre_purchase'],
      required: [true, 'Inspection type is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'cancelled'] as InspectionStatus[],
      default: 'pending',
    },
    mileage: {
      type: Number,
      required: [true, 'Mileage is required'],
      min: 0,
    },
    items: [inspectionItemSchema],
    overallCondition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
    },
    summary: {
      type: String,
      maxlength: 1000,
    },
    recommendations: [{
      type: String,
      maxlength: 200,
    }],
    technicianNotes: {
      type: String,
      maxlength: 1000,
    },
    photos: [String],
    estimateId: {
      type: Schema.Types.ObjectId,
      ref: 'Estimate',
    },
    inspectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Technician ID is required'],
    },
    startedAt: Date,
    completedAt: Date,
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

// Generate inspection number before saving
inspectionHistorySchema.pre('save', function (next) {
  if (!this.inspectionNumber) {
    this.inspectionNumber = generateNumber('INS');
  }
  next();
});

// Calculate overall condition based on items
inspectionHistorySchema.pre('save', function (next) {
  if (this.items.length > 0 && this.status === 'completed') {
    const conditionScores: Record<InspectionItemCondition, number> = {
      good: 4,
      fair: 3,
      poor: 2,
      critical: 1,
      not_applicable: 0,
    };

    const applicableItems = this.items.filter(item => item.condition !== 'not_applicable');
    if (applicableItems.length > 0) {
      const avgScore = applicableItems.reduce((sum, item) => sum + conditionScores[item.condition], 0) / applicableItems.length;

      if (avgScore >= 3.5) this.overallCondition = 'excellent';
      else if (avgScore >= 2.5) this.overallCondition = 'good';
      else if (avgScore >= 1.5) this.overallCondition = 'fair';
      else this.overallCondition = 'poor';
    }
  }
  next();
});

// Indexes
inspectionHistorySchema.index({ inspectionNumber: 1 });
inspectionHistorySchema.index({ type: 1 });
inspectionHistorySchema.index({ status: 1 });
inspectionHistorySchema.index({ inspectedBy: 1 });
inspectionHistorySchema.index({ createdAt: -1 });

export const InspectionHistory = mongoose.model<IInspectionHistory>('InspectionHistory', inspectionHistorySchema);
export default InspectionHistory;
