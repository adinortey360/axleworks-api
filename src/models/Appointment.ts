import mongoose, { Schema } from 'mongoose';
import { IAppointment, ServiceType, AppointmentStatus } from '../types';

const appointmentSchema = new Schema<IAppointment>(
  {
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
      index: true,
    },
    serviceType: {
      type: String,
      enum: ['inspection', 'oil_change', 'brake_service', 'tire_service', 'diagnostic', 'repair', 'maintenance', 'other'] as ServiceType[],
      required: [true, 'Service type is required'],
    },
    scheduledDate: {
      type: Date,
      required: [true, 'Scheduled date is required'],
      index: true,
    },
    scheduledTime: {
      type: String,
      required: [true, 'Scheduled time is required'],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format'],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'] as AppointmentStatus[],
      default: 'pending',
    },
    notes: {
      type: String,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
    workshopName: {
      type: String,
      required: true,
      default: 'AxleWorks Main',
    },
    workshopAddress: {
      type: String,
      default: '123 Main Street',
    },
    estimatedDuration: {
      type: Number,
      min: 0,
    },
    estimatedCost: {
      type: Number,
      min: 0,
    },
    assignedTechnicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
    },
    workOrderId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkOrder',
    },
    cancelledReason: {
      type: String,
      maxlength: [200, 'Cancellation reason cannot exceed 200 characters'],
    },
    confirmedAt: {
      type: Date,
    },
    completedAt: {
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

// Indexes
appointmentSchema.index({ scheduledDate: 1, scheduledTime: 1 });
appointmentSchema.index({ status: 1 });
appointmentSchema.index({ customerId: 1, status: 1 });
appointmentSchema.index({ assignedTechnicianId: 1, scheduledDate: 1 });

export const Appointment = mongoose.model<IAppointment>('Appointment', appointmentSchema);
export default Appointment;
