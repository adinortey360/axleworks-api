import { z } from 'zod';

// ===== Common Schemas =====

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ===== Auth Schemas =====

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().max(20).optional(),
  avatar: z.string().url().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ===== Vehicle Schemas =====

export const vehicleArchetypeSchema = z.enum(['sedan', 'suv', 'pickup', 'hatchback', 'truck', 'coupe', 'van', 'motorcycle']);

export const fuelTypeSchema = z.enum(['petrol', 'diesel', 'hybrid', 'electric']);

export const createVehicleSchema = z.object({
  make: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  vin: z.string().length(17).optional(),
  plateNumber: z.string().max(20).optional(),
  archetype: vehicleArchetypeSchema,
  fuelType: fuelTypeSchema,
  nickname: z.string().max(50).optional(),
  mileage: z.number().int().min(0).optional().default(0),
  color: z.string().max(30).optional(),
  engineSize: z.string().max(20).optional(),
  transmission: z.enum(['manual', 'automatic', 'cvt']).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

// ===== Appointment Schemas =====

export const serviceTypeSchema = z.enum(['inspection', 'oil_change', 'brake_service', 'tire_service', 'diagnostic', 'repair', 'maintenance', 'other']);

export const createAppointmentSchema = z.object({
  vehicleId: objectIdSchema,
  serviceType: serviceTypeSchema,
  scheduledDate: z.string().datetime(),
  scheduledTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  notes: z.string().max(500).optional(),
  workshopName: z.string().min(1).max(100).optional().default('AxleWorks Main'),
  workshopAddress: z.string().max(200).optional().default('123 Main Street'),
  estimatedDuration: z.number().int().positive().optional(),
  estimatedCost: z.number().positive().optional(),
});

export const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  cancelledReason: z.string().max(200).optional(),
});

// ===== Customer Schemas (Workshop) =====

export const createCustomerSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20),
  address: z.object({
    street: z.string().max(100).optional(),
    city: z.string().max(50).optional(),
    state: z.string().max(50).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(50).optional(),
  }).optional(),
  notes: z.string().max(500).optional(),
  tags: z.array(z.string()).optional(),
  source: z.enum(['walk-in', 'app', 'referral', 'website']).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

// ===== Work Order Schemas =====

export const workOrderJobSchema = z.object({
  description: z.string().min(1).max(200),
  system: z.enum(['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel']).optional(),
  estimatedHours: z.number().positive(),
  technicianId: objectIdSchema.optional(),
  notes: z.string().max(500).optional(),
});

export const workOrderPartSchema = z.object({
  inventoryItemId: objectIdSchema.optional(),
  partNumber: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitCost: z.number().min(0),
  unitPrice: z.number().min(0),
});

export const createWorkOrderSchema = z.object({
  customerId: objectIdSchema,
  vehicleId: objectIdSchema,
  appointmentId: objectIdSchema.optional(),
  estimateId: objectIdSchema.optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  type: z.enum(['maintenance', 'repair', 'inspection', 'diagnostic', 'warranty', 'recall']),
  mileageIn: z.number().int().min(0),
  assignedTechnicianId: objectIdSchema.optional(),
  customerConcerns: z.string().max(500).optional(),
  internalNotes: z.string().max(500).optional(),
  jobs: z.array(workOrderJobSchema).optional(),
  parts: z.array(workOrderPartSchema).optional(),
});

export const updateWorkOrderSchema = createWorkOrderSchema.partial().extend({
  status: z.enum(['created', 'in_progress', 'waiting_parts', 'waiting_approval', 'ready', 'completed', 'cancelled']).optional(),
  mileageOut: z.number().int().min(0).optional(),
  technicianNotes: z.string().max(1000).optional(),
});

// ===== Estimate Schemas =====

export const estimateItemSchema = z.object({
  description: z.string().min(1).max(200),
  system: z.enum(['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel']).optional(),
  type: z.enum(['part', 'labour']),
  partNumber: z.string().max(50).optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

export const createEstimateSchema = z.object({
  vehicleId: objectIdSchema,
  customerId: objectIdSchema,
  inspectionId: objectIdSchema.optional(),
  items: z.array(estimateItemSchema).min(1),
  taxRate: z.number().min(0).max(100).optional().default(0),
  validUntil: z.string().datetime().optional(),
  customerNotes: z.string().max(500).optional(),
  internalNotes: z.string().max(500).optional(),
});

export const updateEstimateSchema = createEstimateSchema.partial().extend({
  status: z.enum(['draft', 'sent', 'pending', 'approved', 'declined', 'expired', 'converted']).optional(),
  declinedReason: z.string().max(200).optional(),
});

// ===== Invoice Schemas =====

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1).max(200),
  type: z.enum(['part', 'labour', 'service', 'misc']),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  discount: z.number().min(0).optional(),
});

export const createInvoiceSchema = z.object({
  customerId: objectIdSchema,
  vehicleId: objectIdSchema,
  workOrderId: objectIdSchema.optional(),
  lineItems: z.array(invoiceLineItemSchema).min(1),
  discountAmount: z.number().min(0).optional().default(0),
  taxRate: z.number().min(0).max(100).optional().default(0),
  dueDate: z.string().datetime(),
  notes: z.string().max(500).optional(),
  paymentTerms: z.string().max(100).optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  status: z.enum(['draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled', 'refunded']).optional(),
});

// ===== Payment Schemas =====

export const createPaymentSchema = z.object({
  invoiceId: objectIdSchema,
  amount: z.number().positive(),
  method: z.enum(['cash', 'card', 'bank_transfer', 'check', 'mobile_payment', 'credit']),
  referenceNumber: z.string().max(50).optional(),
  notes: z.string().max(200).optional(),
});

export const refundPaymentSchema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(1).max(200),
});

// ===== Inventory Schemas =====

export const createInventoryItemSchema = z.object({
  sku: z.string().min(1).max(50),
  partNumber: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.string().min(1).max(50),
  brand: z.string().max(50).optional(),
  unitCost: z.number().min(0),
  unitPrice: z.number().min(0),
  quantity: z.number().int().min(0).optional().default(0),
  minQuantity: z.number().int().min(0).optional().default(5),
  maxQuantity: z.number().int().positive().optional(),
  location: z.string().max(50).optional(),
  supplierId: objectIdSchema.optional(),
  compatibleVehicles: z.array(z.string()).optional(),
  warrantyMonths: z.number().int().positive().optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial();

export const adjustStockSchema = z.object({
  adjustment: z.number().int(),
  reason: z.string().min(1).max(200),
});

// ===== Employee Schemas =====

export const createEmployeeSchema = z.object({
  userId: objectIdSchema,
  department: z.enum(['service', 'parts', 'admin', 'management']),
  position: z.string().min(1).max(50),
  specializations: z.array(z.string()).optional(),
  hourlyRate: z.number().positive().optional(),
  salary: z.number().positive().optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  hireDate: z.string().datetime(),
  emergencyContact: z.object({
    name: z.string().min(1).max(50),
    phone: z.string().min(10).max(20),
    relationship: z.string().min(1).max(30),
  }).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

// ===== Expense Schemas =====

export const createExpenseSchema = z.object({
  category: z.enum(['inventory', 'equipment', 'utilities', 'rent', 'wages', 'insurance', 'marketing', 'supplies', 'other']),
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  taxDeductible: z.boolean().optional().default(true),
  date: z.string().datetime(),
  vendor: z.string().max(100).optional(),
  paymentMethod: z.string().max(50).optional(),
  referenceNumber: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
});

export const updateExpenseSchema = createExpenseSchema.partial();

// ===== Inspection Schemas =====

export const inspectionResultSchema = z.object({
  system: z.enum(['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel']),
  condition: z.enum(['normal', 'warning', 'critical']),
  notes: z.string().max(500).optional(),
});

export const createInspectionSchema = z.object({
  vehicleId: objectIdSchema,
  customerId: objectIdSchema,
  workOrderId: objectIdSchema.optional(),
  mileageAtInspection: z.number().int().min(0),
  results: z.array(inspectionResultSchema),
  overallHealth: z.enum(['excellent', 'good', 'fair', 'poor', 'critical']),
  recommendations: z.array(z.string()).optional(),
  nextServiceDue: z.string().datetime().optional(),
  technicianName: z.string().max(100).optional(),
});

// ===== OBD Schemas =====

export const vehicleStatsSchema = z.object({
  vehicleId: objectIdSchema,
  rpm: z.number().min(0),
  speed: z.number().min(0),
  engineTemp: z.number(),
  fuelLevel: z.number().min(0).max(100),
  batteryVoltage: z.number().min(0),
  throttlePosition: z.number().min(0).max(100),
  engineLoad: z.number().min(0).max(100),
  intakeTemp: z.number().optional(),
  oilTemp: z.number().optional(),
  coolantTemp: z.number().optional(),
  massAirFlow: z.number().optional(),
  fuelPressure: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const diagnosticCodeSchema = z.object({
  vehicleId: objectIdSchema,
  code: z.string().min(1).max(10),
  description: z.string().min(1).max(200),
  severity: z.enum(['info', 'warning', 'critical']),
  system: z.enum(['engine', 'transmission', 'brakes', 'suspension', 'steering', 'cooling', 'exhaust', 'electrical', 'fuel']),
  rawData: z.record(z.any()).optional(),
});

// ===== Supplier Schemas =====

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(100),
  contactName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(10).max(20),
  address: z.object({
    street: z.string().max(100).optional(),
    city: z.string().max(50).optional(),
    state: z.string().max(50).optional(),
    postalCode: z.string().max(20).optional(),
    country: z.string().max(50).optional(),
  }).optional(),
  website: z.string().url().optional(),
  paymentTerms: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial();
