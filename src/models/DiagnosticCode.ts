import mongoose, { Schema } from 'mongoose';
import { IDiagnosticCode, Severity, SystemType } from '../types';

const diagnosticCodeSchema = new Schema<IDiagnosticCode>(
  {
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle ID is required'],
      index: true,
    },
    code: {
      type: String,
      required: [true, 'Code is required'],
      trim: true,
      uppercase: true,
      maxlength: [10, 'Code cannot exceed 10 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'] as Severity[],
      required: [true, 'Severity is required'],
    },
    system: {
      type: String,
      enum: ['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel'] as SystemType[],
      required: [true, 'System is required'],
    },
    detectedAt: {
      type: Date,
      default: Date.now,
    },
    clearedAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rawData: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes
diagnosticCodeSchema.index({ vehicleId: 1, isActive: 1 });
diagnosticCodeSchema.index({ vehicleId: 1, code: 1 });
diagnosticCodeSchema.index({ severity: 1 });
diagnosticCodeSchema.index({ detectedAt: -1 });

export const DiagnosticCode = mongoose.model<IDiagnosticCode>('DiagnosticCode', diagnosticCodeSchema);
export default DiagnosticCode;
