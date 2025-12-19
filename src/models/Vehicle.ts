import mongoose, { Schema } from 'mongoose';
import { IVehicle, VehicleArchetype, FuelType, VehicleHealthStatus } from '../types';

const vehicleSchema = new Schema<IVehicle>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    make: {
      type: String,
      required: [true, 'Make is required'],
      trim: true,
      maxlength: [50, 'Make cannot exceed 50 characters'],
    },
    model: {
      type: String,
      required: [true, 'Model is required'],
      trim: true,
      maxlength: [50, 'Model cannot exceed 50 characters'],
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: [1900, 'Invalid year'],
      max: [new Date().getFullYear() + 1, 'Invalid year'],
    },
    vin: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: [17, 'VIN must be 17 characters'],
      maxlength: [17, 'VIN must be 17 characters'],
      sparse: true,
    },
    plateNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [20, 'Plate number cannot exceed 20 characters'],
    },
    archetype: {
      type: String,
      enum: ['sedan', 'suv', 'pickup', 'hatchback', 'truck', 'coupe', 'van', 'motorcycle'] as VehicleArchetype[],
      required: [true, 'Vehicle type is required'],
    },
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'hybrid', 'electric'] as FuelType[],
      required: [true, 'Fuel type is required'],
    },
    nickname: {
      type: String,
      trim: true,
      maxlength: [50, 'Nickname cannot exceed 50 characters'],
    },
    mileage: {
      type: Number,
      default: 0,
      min: [0, 'Mileage cannot be negative'],
    },
    healthStatus: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'critical'] as VehicleHealthStatus[],
      default: 'good',
    },
    color: {
      type: String,
      trim: true,
      maxlength: [30, 'Color cannot exceed 30 characters'],
    },
    engineSize: {
      type: String,
      trim: true,
      maxlength: [20, 'Engine size cannot exceed 20 characters'],
    },
    transmission: {
      type: String,
      enum: ['manual', 'automatic', 'cvt'],
    },
    lastSyncedAt: {
      type: Date,
    },
    obdDeviceId: {
      type: String,
      trim: true,
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

// Indexes
vehicleSchema.index({ customerId: 1, isActive: 1 });
vehicleSchema.index({ vin: 1 }, { sparse: true, unique: true });
vehicleSchema.index({ plateNumber: 1 }, { sparse: true });
vehicleSchema.index({ make: 1, model: 1 });

// Virtual for display name
vehicleSchema.virtual('displayName').get(function () {
  return this.nickname || `${this.year} ${this.make} ${this.model}`;
});

export const Vehicle = mongoose.model<IVehicle>('Vehicle', vehicleSchema);
export default Vehicle;
