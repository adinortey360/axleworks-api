import { WorkOrder, Customer, Vehicle, Invoice } from '../models';
import { IWorkOrder, IWorkOrderJob, IWorkOrderPart, WorkOrderStatus, WorkOrderPriority, WorkOrderType } from '../types';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../utils/helpers';

interface CreateWorkOrderInput {
  customerId: string;
  vehicleId: string;
  appointmentId?: string;
  estimateId?: string;
  type: WorkOrderType;
  priority?: WorkOrderPriority;
  mileageIn: number;
  customerConcerns?: string;
  internalNotes?: string;
  assignedTechnicianId?: string;
  createdBy: string;
}

interface WorkOrderQuery {
  page?: number;
  limit?: number;
  status?: WorkOrderStatus;
  priority?: WorkOrderPriority;
  type?: WorkOrderType;
  customerId?: string;
  vehicleId?: string;
  technicianId?: string;
  startDate?: Date;
  endDate?: Date;
}

export const workOrderService = {
  async getAllWorkOrders(query: WorkOrderQuery) {
    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.customerId) {
      filter.customerId = toObjectId(query.customerId);
    }
    if (query.vehicleId) {
      filter.vehicleId = toObjectId(query.vehicleId);
    }
    if (query.technicianId) {
      filter.assignedTechnicianId = toObjectId(query.technicianId);
    }
    if (query.startDate || query.endDate) {
      filter.createdAt = {};
      if (query.startDate) {
        (filter.createdAt as Record<string, Date>).$gte = query.startDate;
      }
      if (query.endDate) {
        (filter.createdAt as Record<string, Date>).$lte = query.endDate;
      }
    }

    const [workOrders, total] = await Promise.all([
      WorkOrder.find(filter)
        .populate('customerId', 'firstName lastName phone email')
        .populate('vehicleId', 'make model year licensePlate')
        .populate('assignedTechnicianId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WorkOrder.countDocuments(filter),
    ]);

    return {
      data: workOrders,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getWorkOrderById(workOrderId: string) {
    const workOrder = await WorkOrder.findById(workOrderId)
      .populate('customerId', 'firstName lastName phone email address')
      .populate('vehicleId')
      .populate('assignedTechnicianId', 'firstName lastName email phone')
      .populate('appointmentId')
      .populate('estimateId')
      .populate('invoiceId')
      .populate('createdBy', 'firstName lastName')
      .lean();

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    return workOrder;
  },

  async createWorkOrder(input: CreateWorkOrderInput) {
    // Verify customer and vehicle exist
    const [customer, vehicle] = await Promise.all([
      Customer.findById(input.customerId),
      Vehicle.findById(input.vehicleId),
    ]);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }
    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const workOrder = new WorkOrder({
      ...input,
      status: 'created',
    });

    await workOrder.save();

    return workOrder.toJSON();
  },

  async updateWorkOrder(workOrderId: string, updates: Partial<IWorkOrder>) {
    const workOrder = await WorkOrder.findByIdAndUpdate(
      workOrderId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    return workOrder.toJSON();
  },

  async updateWorkOrderStatus(workOrderId: string, status: WorkOrderStatus) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    // Validate status transition
    const validTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
      created: ['in_progress', 'cancelled'],
      in_progress: ['waiting_parts', 'waiting_approval', 'ready', 'cancelled'],
      waiting_parts: ['in_progress', 'cancelled'],
      waiting_approval: ['in_progress', 'cancelled'],
      ready: ['completed', 'in_progress'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[workOrder.status].includes(status)) {
      throw new BadRequestError(`Cannot transition from ${workOrder.status} to ${status}`);
    }

    workOrder.status = status;

    if (status === 'in_progress' && !workOrder.startedAt) {
      workOrder.startedAt = new Date();
    }

    if (status === 'completed') {
      workOrder.completedAt = new Date();
    }

    await workOrder.save();

    return workOrder.toJSON();
  },

  async addJob(workOrderId: string, job: IWorkOrderJob) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    workOrder.jobs.push(job);
    await workOrder.save();

    return workOrder.toJSON();
  },

  async updateJob(workOrderId: string, jobId: string, updates: Partial<IWorkOrderJob>) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    const jobIndex = workOrder.jobs.findIndex(j => j._id?.toString() === jobId);
    if (jobIndex === -1) {
      throw new NotFoundError('Job not found');
    }

    Object.assign(workOrder.jobs[jobIndex], updates);

    if (updates.status === 'in_progress' && !workOrder.jobs[jobIndex].startedAt) {
      workOrder.jobs[jobIndex].startedAt = new Date();
    }

    if (updates.status === 'completed') {
      workOrder.jobs[jobIndex].completedAt = new Date();
    }

    await workOrder.save();

    return workOrder.toJSON();
  },

  async removeJob(workOrderId: string, jobId: string) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    workOrder.jobs = workOrder.jobs.filter(j => j._id?.toString() !== jobId);
    await workOrder.save();

    return workOrder.toJSON();
  },

  async addPart(workOrderId: string, part: IWorkOrderPart) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    // Calculate part total
    part.total = part.quantity * part.unitPrice;

    workOrder.parts.push(part);
    await workOrder.save();

    return workOrder.toJSON();
  },

  async updatePart(workOrderId: string, partId: string, updates: Partial<IWorkOrderPart>) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    const partIndex = workOrder.parts.findIndex(p => p._id?.toString() === partId);
    if (partIndex === -1) {
      throw new NotFoundError('Part not found');
    }

    Object.assign(workOrder.parts[partIndex], updates);

    // Recalculate total
    const part = workOrder.parts[partIndex];
    part.total = part.quantity * part.unitPrice;

    await workOrder.save();

    return workOrder.toJSON();
  },

  async removePart(workOrderId: string, partId: string) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    workOrder.parts = workOrder.parts.filter(p => p._id?.toString() !== partId);
    await workOrder.save();

    return workOrder.toJSON();
  },

  async deleteWorkOrder(workOrderId: string) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    if (workOrder.invoiceId) {
      throw new BadRequestError('Cannot delete work order with associated invoice');
    }

    await WorkOrder.findByIdAndDelete(workOrderId);

    return { message: 'Work order deleted successfully' };
  },

  async getActiveWorkOrders() {
    const workOrders = await WorkOrder.find({
      status: { $nin: ['completed', 'cancelled'] },
    })
      .populate('customerId', 'firstName lastName phone')
      .populate('vehicleId', 'make model year licensePlate')
      .populate('assignedTechnicianId', 'firstName lastName')
      .sort({ priority: -1, createdAt: 1 })
      .lean();

    return workOrders;
  },

  async getTechnicianWorkOrders(technicianId: string, status?: WorkOrderStatus) {
    const filter: Record<string, unknown> = { assignedTechnicianId: toObjectId(technicianId) };

    if (status) {
      filter.status = status;
    } else {
      filter.status = { $nin: ['completed', 'cancelled'] };
    }

    const workOrders = await WorkOrder.find(filter)
      .populate('customerId', 'firstName lastName phone')
      .populate('vehicleId', 'make model year licensePlate')
      .sort({ priority: -1, createdAt: 1 })
      .lean();

    return workOrders;
  },

  async generateInvoiceFromWorkOrder(workOrderId: string, userId: string) {
    const workOrder = await WorkOrder.findById(workOrderId);

    if (!workOrder) {
      throw new NotFoundError('Work order not found');
    }

    if (workOrder.invoiceId) {
      throw new BadRequestError('Invoice already generated for this work order');
    }

    // Create line items from jobs and parts
    const lineItems = [
      // Labour items
      ...workOrder.jobs.map(job => ({
        description: job.description,
        type: 'labour' as const,
        quantity: job.actualHours || job.estimatedHours,
        unitPrice: 80, // TODO: Make configurable
        discount: 0,
        total: (job.actualHours || job.estimatedHours) * 80,
      })),
      // Part items
      ...workOrder.parts.map(part => ({
        description: part.description,
        type: 'part' as const,
        quantity: part.quantity,
        unitPrice: part.unitPrice,
        discount: 0,
        total: part.total,
      })),
    ];

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const taxRate = 13; // TODO: Make configurable
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const invoice = new Invoice({
      customerId: workOrder.customerId,
      vehicleId: workOrder.vehicleId,
      workOrderId: workOrder._id,
      lineItems,
      subtotal,
      taxRate,
      taxAmount,
      total,
      amountDue: total,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      createdBy: userId,
    });

    await invoice.save();

    // Link invoice to work order
    workOrder.invoiceId = invoice._id;
    await workOrder.save();

    return invoice.toJSON();
  },
};

export default workOrderService;
