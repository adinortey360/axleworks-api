import { Request } from 'express';
import { Document, Types } from 'mongoose';

// ===== Enums =====

export type UserRole = 'customer' | 'admin' | 'manager' | 'technician';

export type VehicleArchetype = 'sedan' | 'suv' | 'pickup' | 'hatchback' | 'truck' | 'coupe' | 'van' | 'motorcycle';

export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'electric';

export type VehicleHealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';

export type SystemType = 'engine' | 'transmission' | 'brakes' | 'suspension' | 'steering' | 'cooling' | 'exhaust' | 'electrical' | 'fuel';

export type SystemCondition = 'normal' | 'warning' | 'critical';

export type Severity = 'info' | 'warning' | 'critical';

export type ServiceType = 'inspection' | 'oil_change' | 'brake_service' | 'tire_service' | 'diagnostic' | 'repair' | 'maintenance' | 'other';

export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type EstimateStatus = 'draft' | 'sent' | 'pending' | 'approved' | 'declined' | 'expired' | 'converted' | 'rejected';

export type WorkOrderStatus = 'created' | 'in_progress' | 'waiting_parts' | 'waiting_approval' | 'ready' | 'completed' | 'cancelled';

export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';

export type WorkOrderType = 'maintenance' | 'repair' | 'inspection' | 'diagnostic' | 'warranty' | 'recall';

export type JobStatus = 'pending' | 'in_progress' | 'completed' | 'on_hold';

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'check' | 'mobile_payment' | 'credit' | 'credit_card' | 'debit_card' | 'cheque' | 'other';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type ExpenseCategory = 'inventory' | 'equipment' | 'utilities' | 'rent' | 'wages' | 'insurance' | 'marketing' | 'supplies' | 'other' | 'parts' | 'payroll' | 'maintenance' | 'taxes';

export type EmployeeRole = 'technician' | 'service_advisor' | 'manager' | 'admin' | 'receptionist';

export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'terminated';

export type InspectionStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export type InspectionItemCondition = 'good' | 'fair' | 'poor' | 'critical' | 'not_applicable';

export type InventoryCategory = 'engine' | 'transmission' | 'brakes' | 'suspension' | 'electrical' | 'body' | 'fluids' | 'filters' | 'tires' | 'accessories' | 'other';

export type Department = 'service' | 'parts' | 'admin' | 'management';

export type CustomerSource = 'walk-in' | 'app' | 'referral' | 'website';

// ===== JWT Payload =====

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  customerId?: string;
  employeeId?: string;
}

// ===== Express Extensions =====

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

// ===== API Response Types =====

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: PaginationInfo;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ===== Document Interfaces =====

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  lastLogin?: Date;
  lastLoginAt?: Date;
  refreshToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  customerId?: Types.ObjectId;
  employeeId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
  fullName: string;
}

// Note: Using Omit to avoid conflict with Document's model() method
export interface IVehicle extends Omit<Document, 'model'> {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  make: string;
  model: string;
  year: number;
  vin?: string;
  licensePlate?: string;
  plateNumber?: string;
  vehicleType?: string;
  archetype?: VehicleArchetype;
  fuelType?: FuelType;
  nickname?: string;
  mileage?: number;
  healthStatus?: VehicleHealthStatus;
  color?: string;
  engineSize?: string;
  transmission?: 'manual' | 'automatic' | 'cvt';
  lastSyncedAt?: Date;
  lastOBDSync?: Date;
  obdDeviceId?: string;
  photo?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVehicleStats extends Document {
  _id: Types.ObjectId;
  vehicleId: Types.ObjectId;
  rpm: number;
  speed: number;
  engineTemp: number;
  fuelLevel: number;
  batteryVoltage: number;
  throttlePosition: number;
  engineLoad: number;
  intakeTemp?: number;
  oilTemp?: number;
  oilPressure?: number;
  coolantTemp?: number;
  massAirFlow?: number;
  fuelPressure?: number;
  latitude?: number;
  longitude?: number;
  timestamp: Date;
}

export interface IDiagnosticCode extends Document {
  _id: Types.ObjectId;
  vehicleId: Types.ObjectId;
  code: string;
  description: string;
  severity: Severity;
  system: SystemType;
  detectedAt: Date;
  clearedAt?: Date;
  isActive: boolean;
  rawData?: Record<string, any>;
  createdAt: Date;
}

export interface IAppointment extends Document {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  serviceType: ServiceType;
  scheduledDate: Date;
  scheduledTime: string;
  status: AppointmentStatus;
  notes?: string;
  workshopName: string;
  workshopAddress: string;
  estimatedDuration?: number;
  estimatedCost?: number;
  assignedTechnicianId?: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  cancelledReason?: string;
  confirmedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInspectionResult {
  system: SystemType;
  condition: SystemCondition;
  notes?: string;
  photoUrls?: string[];
}

export interface IInspectionItem {
  _id?: Types.ObjectId;
  name: string;
  category: string;
  condition: InspectionItemCondition;
  notes?: string;
  photos?: string[];
  requiresAttention?: boolean;
}

export interface IInspectionHistory extends Document {
  _id: Types.ObjectId;
  inspectionNumber: string;
  vehicleId: Types.ObjectId;
  customerId: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  type: 'pre_service' | 'post_service' | 'multi_point' | 'safety' | 'emissions' | 'pre_purchase';
  status: InspectionStatus;
  mileage: number;
  items: IInspectionItem[];
  results?: IInspectionResult[];
  overallCondition?: 'excellent' | 'good' | 'fair' | 'poor';
  overallHealth?: VehicleHealthStatus;
  summary?: string;
  recommendations?: string[];
  technicianNotes?: string;
  photos?: string[];
  estimateId?: Types.ObjectId;
  inspectedBy: Types.ObjectId;
  technicianId?: Types.ObjectId;
  technicianName?: string;
  performedAt?: Date;
  workshopName?: string;
  mileageAtInspection?: number;
  nextServiceDue?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IEstimateItem {
  _id?: Types.ObjectId;
  description: string;
  system?: SystemType;
  type: 'part' | 'labour' | 'service' | 'misc';
  partNumber?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

// Alias for backwards compatibility
export type IEstimateLineItem = IEstimateItem;

export interface IEstimate extends Document {
  _id: Types.ObjectId;
  estimateNumber: string;
  vehicleId: Types.ObjectId;
  customerId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  inspectionId?: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  lineItems: IEstimateItem[];
  items?: IEstimateItem[]; // Alias
  partsTotal?: number;
  labourTotal?: number;
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  grandTotal?: number; // Alias
  status: EstimateStatus;
  validUntil: Date;
  notes?: string;
  terms?: string;
  customerNotes?: string;
  internalNotes?: string;
  sentAt?: Date;
  approvedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  declinedAt?: Date;
  declinedReason?: string;
  convertedToWorkOrderId?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomer extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  vehicles: Types.ObjectId[];
  totalSpent: number;
  visitCount: number;
  lastVisit?: Date;
  notes?: string;
  tags?: string[];
  source?: CustomerSource;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
}

export interface IWorkOrderJob {
  _id?: Types.ObjectId;
  description: string;
  system?: SystemType;
  estimatedHours: number;
  actualHours?: number;
  status: JobStatus;
  technicianId?: Types.ObjectId;
  notes?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface IWorkOrderPart {
  _id?: Types.ObjectId;
  inventoryItemId?: Types.ObjectId;
  partNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  total: number;
}

export interface IWorkOrder extends Document {
  _id: Types.ObjectId;
  workOrderNumber: string;
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  estimateId?: Types.ObjectId;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  type: WorkOrderType;
  jobs: IWorkOrderJob[];
  parts: IWorkOrderPart[];
  mileageIn: number;
  mileageOut?: number;
  assignedTechnicianId?: Types.ObjectId;
  customerConcerns?: string;
  technicianNotes?: string;
  internalNotes?: string;
  photos?: string[];
  labourTotal: number;
  partsTotal: number;
  taxAmount: number;
  total: number;
  invoiceId?: Types.ObjectId;
  startedAt?: Date;
  completedAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInvoiceLineItem {
  _id?: Types.ObjectId;
  description: string;
  type: 'part' | 'labour' | 'service' | 'misc';
  quantity: number;
  unitPrice: number;
  discount?: number;
  total: number;
}

export interface IInvoice extends Document {
  _id: Types.ObjectId;
  invoiceNumber: string;
  customerId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  lineItems: IInvoiceLineItem[];
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  dueDate: Date;
  notes?: string;
  paymentTerms?: string;
  payments: Types.ObjectId[];
  sentAt?: Date;
  paidAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPayment extends Document {
  _id: Types.ObjectId;
  paymentNumber: string;
  invoiceId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  referenceNumber?: string;
  notes?: string;
  processedAt?: Date;
  processedBy?: Types.ObjectId;
  refundedAmount?: number;
  refundedAt?: Date;
  refundReason?: string;
  createdAt: Date;
}

export interface IEmployee extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: EmployeeRole;
  status: EmployeeStatus;
  department?: Department;
  position?: string;
  specializations?: string[];
  certifications?: {
    _id?: Types.ObjectId;
    name: string;
    issuer?: string;
    issuedDate?: Date;
    expiryDate?: Date;
    issuedAt?: Date;
    expiresAt?: Date;
  }[];
  hourlyRate?: number;
  salary?: number;
  commissionRate?: number;
  hireDate: Date;
  terminationDate?: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  emergencyContact?: {
    name?: string;
    phone?: string;
    relationship?: string;
  };
  workOrdersCompleted?: number;
  rating?: number;
  notes?: string;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
  fullName?: string;
}

export interface IInventoryItem extends Document {
  _id: Types.ObjectId;
  sku?: string;
  partNumber: string;
  name: string;
  description?: string;
  category: InventoryCategory | string;
  brand?: string;
  unitCost: number;
  unitPrice: number;
  markup?: number;
  quantity: number;
  minQuantity: number;
  maxQuantity?: number;
  location?: {
    aisle?: string;
    shelf?: string;
    bin?: string;
  } | string;
  supplierId?: Types.ObjectId;
  compatibleVehicles?: {
    make?: string;
    model?: string;
    yearFrom?: number;
    yearTo?: number;
  }[] | string[];
  barcode?: string;
  warrantyMonths?: number;
  isActive: boolean;
  lastRestockedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISupplier extends Document {
  _id: Types.ObjectId;
  name: string;
  contactName?: string;
  contactPerson?: string;
  email?: string;
  phone: string;
  alternatePhone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  website?: string;
  paymentTerms?: string;
  accountNumber?: string;
  taxId?: string;
  categories?: InventoryCategory[];
  rating?: number;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IExpense extends Document {
  _id: Types.ObjectId;
  expenseNumber: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  taxDeductible: boolean;
  date: Date;
  vendor?: string;
  supplierId?: Types.ObjectId;
  paymentMethod?: PaymentMethod;
  reference?: string;
  receiptUrl?: string;
  referenceNumber?: string;
  isRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  notes?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
}
