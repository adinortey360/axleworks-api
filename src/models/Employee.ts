import mongoose, { Schema } from 'mongoose';
import { IEmployee, EmployeeRole, EmployeeStatus } from '../types';

const employeeSchema = new Schema<IEmployee>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
    },
    employeeNumber: {
      type: String,
      unique: true,
      required: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
    },
    role: {
      type: String,
      enum: ['technician', 'service_advisor', 'manager', 'admin', 'receptionist'] as EmployeeRole[],
      required: [true, 'Role is required'],
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'terminated'] as EmployeeStatus[],
      default: 'active',
    },
    hireDate: {
      type: Date,
      required: [true, 'Hire date is required'],
    },
    terminationDate: {
      type: Date,
    },
    hourlyRate: {
      type: Number,
      min: 0,
    },
    salary: {
      type: Number,
      min: 0,
    },
    certifications: [{
      name: {
        type: String,
        required: true,
        maxlength: 100,
      },
      issuer: {
        type: String,
        maxlength: 100,
      },
      issuedDate: {
        type: Date,
      },
      expiryDate: {
        type: Date,
      },
    }],
    specializations: [{
      type: String,
      trim: true,
    }],
    emergencyContact: {
      name: {
        type: String,
        maxlength: 100,
      },
      phone: {
        type: String,
        maxlength: 20,
      },
      relationship: {
        type: String,
        maxlength: 50,
      },
    },
    address: {
      street: { type: String, trim: true, maxlength: 100 },
      city: { type: String, trim: true, maxlength: 50 },
      state: { type: String, trim: true, maxlength: 50 },
      postalCode: { type: String, trim: true, maxlength: 20 },
      country: { type: String, trim: true, maxlength: 50 },
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

// Virtual for full name
employeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes
employeeSchema.index({ employeeNumber: 1 });
employeeSchema.index({ role: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text' });

export const Employee = mongoose.model<IEmployee>('Employee', employeeSchema);
export default Employee;
