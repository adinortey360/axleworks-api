import mongoose, { Schema } from 'mongoose';
import { IWorkOrder, IWorkOrderJob, IWorkOrderPart, WorkOrderStatus, WorkOrderPriority, WorkOrderType, JobStatus, SystemType } from '../types';
import { generateNumber } from '../utils/helpers';

const workOrderJobSchema = new Schema<IWorkOrderJob>(
  {
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    system: {
      type: String,
      enum: ['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel'] as SystemType[],
    },
    estimatedHours: {
      type: Number,
      required: true,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'on_hold'] as JobStatus[],
      default: 'pending',
    },
    technicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
    },
    notes: {
      type: String,
      maxlength: 500,
    },
    startedAt: Date,
    completedAt: Date,
  },
  { _id: true }
);

const workOrderPartSchema = new Schema<IWorkOrderPart>(
  {
    inventoryItemId: {
      type: Schema.Types.ObjectId,
      ref: 'InventoryItem',
    },
    partNumber: {
      type: String,
      required: true,
      maxlength: 50,
    },
    description: {
      type: String,
      required: true,
      maxlength: 200,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    unitPrice: {
      type: Number,
      required: true,
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

const workOrderSchema = new Schema<IWorkOrder>(
  {
    workOrderNumber: {
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
      index: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
    },
    estimateId: {
      type: Schema.Types.ObjectId,
      ref: 'Estimate',
    },
    status: {
      type: String,
      enum: ['created', 'in_progress', 'waiting_parts', 'waiting_approval', 'ready', 'completed', 'cancelled'] as WorkOrderStatus[],
      default: 'created',
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'] as WorkOrderPriority[],
      default: 'normal',
    },
    type: {
      type: String,
      enum: ['maintenance', 'repair', 'inspection', 'diagnostic', 'warranty', 'recall'] as WorkOrderType[],
      required: [true, 'Work order type is required'],
    },
    jobs: [workOrderJobSchema],
    parts: [workOrderPartSchema],
    mileageIn: {
      type: Number,
      required: [true, 'Mileage in is required'],
      min: 0,
    },
    mileageOut: {
      type: Number,
      min: 0,
    },
    assignedTechnicianId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
    },
    customerConcerns: {
      type: String,
      maxlength: 500,
    },
    technicianNotes: {
      type: String,
      maxlength: 1000,
    },
    internalNotes: {
      type: String,
      maxlength: 500,
    },
    photos: [String],
    labourTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    partsTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    startedAt: Date,
    completedAt: Date,
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

// Generate work order number before saving
workOrderSchema.pre('save', function (next) {
  if (!this.workOrderNumber) {
    this.workOrderNumber = generateNumber('WO');
  }
  next();
});

// Calculate totals before saving
workOrderSchema.pre('save', function (next) {
  // Calculate parts total
  this.partsTotal = this.parts.reduce((sum, part) => sum + part.total, 0);

  // Calculate labour total (assuming $80/hour rate - this should be configurable)
  const labourRate = 80;
  const totalHours = this.jobs.reduce((sum, job) => sum + (job.actualHours || job.estimatedHours), 0);
  this.labourTotal = totalHours * labourRate;

  // Calculate total
  this.total = this.partsTotal + this.labourTotal + this.taxAmount;

  next();
});

// Indexes
workOrderSchema.index({ workOrderNumber: 1 });
workOrderSchema.index({ status: 1 });
workOrderSchema.index({ priority: 1 });
workOrderSchema.index({ assignedTechnicianId: 1, status: 1 });
workOrderSchema.index({ createdAt: -1 });

export const WorkOrder = mongoose.model<IWorkOrder>('WorkOrder', workOrderSchema);
export default WorkOrder;
