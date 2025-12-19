import mongoose, { Schema } from 'mongoose';
import { IVehicleStats } from '../types';

const vehicleStatsSchema = new Schema<IVehicleStats>(
  {
    vehicleId: {
      type: Schema.Types.ObjectId,
      ref: 'Vehicle',
      required: [true, 'Vehicle ID is required'],
      index: true,
    },
    rpm: {
      type: Number,
      required: true,
      min: 0,
    },
    speed: {
      type: Number,
      required: true,
      min: 0,
    },
    engineTemp: {
      type: Number,
      required: true,
    },
    fuelLevel: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    batteryVoltage: {
      type: Number,
      required: true,
      min: 0,
    },
    throttlePosition: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    engineLoad: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    intakeTemp: {
      type: Number,
    },
    oilTemp: {
      type: Number,
    },
    coolantTemp: {
      type: Number,
    },
    massAirFlow: {
      type: Number,
    },
    fuelPressure: {
      type: Number,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    toJSON: {
      transform: (_, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound index for querying by vehicle and time range
vehicleStatsSchema.index({ vehicleId: 1, timestamp: -1 });

// TTL index - automatically delete stats older than 7 days
vehicleStatsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

export const VehicleStats = mongoose.model<IVehicleStats>('VehicleStats', vehicleStatsSchema);
export default VehicleStats;
