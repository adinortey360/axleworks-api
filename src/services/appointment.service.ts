import { Appointment, Customer, Vehicle } from '../models';
import { IAppointment, ServiceType, AppointmentStatus } from '../types';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../utils/helpers';

interface CreateAppointmentInput {
  vehicleId: string;
  serviceType: ServiceType;
  scheduledDate: Date;
  scheduledTime: string;
  notes?: string;
  estimatedDuration?: number;
}

interface AppointmentQuery {
  page?: number;
  limit?: number;
  status?: AppointmentStatus;
  startDate?: Date;
  endDate?: Date;
}

export const appointmentService = {
  // Customer-facing methods
  async getCustomerAppointments(userId: string, query: AppointmentQuery) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = { customerId: customer._id };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.startDate || query.endDate) {
      filter.scheduledDate = {};
      if (query.startDate) {
        (filter.scheduledDate as Record<string, Date>).$gte = query.startDate;
      }
      if (query.endDate) {
        (filter.scheduledDate as Record<string, Date>).$lte = query.endDate;
      }
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate('vehicleId', 'make model year licensePlate')
        .sort({ scheduledDate: -1, scheduledTime: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(filter),
    ]);

    return {
      data: appointments,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getCustomerAppointment(userId: string, appointmentId: string) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      customerId: customer._id,
    })
      .populate('vehicleId', 'make model year licensePlate vin')
      .populate('assignedTechnicianId', 'firstName lastName')
      .lean();

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return appointment;
  },

  async createCustomerAppointment(userId: string, input: CreateAppointmentInput) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    // Verify vehicle belongs to customer
    const vehicle = await Vehicle.findOne({
      _id: input.vehicleId,
      customerId: customer._id,
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    // Check for scheduling conflicts
    const existingAppointment = await Appointment.findOne({
      scheduledDate: input.scheduledDate,
      scheduledTime: input.scheduledTime,
      status: { $nin: ['cancelled', 'completed'] },
    });

    if (existingAppointment) {
      throw new BadRequestError('This time slot is not available');
    }

    const appointment = new Appointment({
      ...input,
      customerId: customer._id,
      status: 'pending',
    });

    await appointment.save();

    return appointment.toJSON();
  },

  async updateCustomerAppointment(
    userId: string,
    appointmentId: string,
    updates: Partial<CreateAppointmentInput>
  ) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      customerId: customer._id,
    });

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    // Can only update pending or confirmed appointments
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new BadRequestError('Cannot update this appointment');
    }

    // If changing time, check for conflicts
    if (updates.scheduledDate || updates.scheduledTime) {
      const existingAppointment = await Appointment.findOne({
        _id: { $ne: appointmentId },
        scheduledDate: updates.scheduledDate || appointment.scheduledDate,
        scheduledTime: updates.scheduledTime || appointment.scheduledTime,
        status: { $nin: ['cancelled', 'completed'] },
      });

      if (existingAppointment) {
        throw new BadRequestError('This time slot is not available');
      }
    }

    Object.assign(appointment, updates);
    await appointment.save();

    return appointment.toJSON();
  },

  async cancelCustomerAppointment(userId: string, appointmentId: string, reason?: string) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      customerId: customer._id,
    });

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    // Can only cancel pending or confirmed appointments
    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new BadRequestError('Cannot cancel this appointment');
    }

    appointment.status = 'cancelled';
    appointment.cancelledReason = reason;
    await appointment.save();

    return appointment.toJSON();
  },

  // Workshop-facing methods
  async getAllAppointments(query: AppointmentQuery & { customerId?: string; technicianId?: string }) {
    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = {};

    if (query.customerId) {
      filter.customerId = toObjectId(query.customerId);
    }

    if (query.technicianId) {
      filter.assignedTechnicianId = toObjectId(query.technicianId);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.startDate || query.endDate) {
      filter.scheduledDate = {};
      if (query.startDate) {
        (filter.scheduledDate as Record<string, Date>).$gte = query.startDate;
      }
      if (query.endDate) {
        (filter.scheduledDate as Record<string, Date>).$lte = query.endDate;
      }
    }

    const [appointments, total] = await Promise.all([
      Appointment.find(filter)
        .populate('customerId', 'firstName lastName phone email')
        .populate('vehicleId', 'make model year licensePlate')
        .populate('assignedTechnicianId', 'firstName lastName')
        .sort({ scheduledDate: 1, scheduledTime: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Appointment.countDocuments(filter),
    ]);

    return {
      data: appointments,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getAppointmentById(appointmentId: string) {
    const appointment = await Appointment.findById(appointmentId)
      .populate('customerId', 'firstName lastName phone email')
      .populate('vehicleId', 'make model year licensePlate vin mileage')
      .populate('assignedTechnicianId', 'firstName lastName')
      .populate('workOrderId')
      .lean();

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return appointment;
  },

  async createAppointment(input: CreateAppointmentInput & { customerId: string }) {
    const appointment = new Appointment({
      ...input,
      status: 'pending',
    });

    await appointment.save();

    return appointment.toJSON();
  },

  async updateAppointment(appointmentId: string, updates: Partial<IAppointment>) {
    const appointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return appointment.toJSON();
  },

  async updateAppointmentStatus(
    appointmentId: string,
    status: AppointmentStatus,
    additionalData?: { cancelledReason?: string; completedAt?: Date; confirmedAt?: Date }
  ) {
    const updateData: Record<string, unknown> = { status };

    if (status === 'cancelled' && additionalData?.cancelledReason) {
      updateData.cancelledReason = additionalData.cancelledReason;
    }

    if (status === 'completed') {
      updateData.completedAt = additionalData?.completedAt || new Date();
    }

    if (status === 'confirmed') {
      updateData.confirmedAt = additionalData?.confirmedAt || new Date();
    }

    const appointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { $set: updateData },
      { new: true }
    );

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return appointment.toJSON();
  },

  async deleteAppointment(appointmentId: string) {
    const appointment = await Appointment.findByIdAndDelete(appointmentId);

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    return { message: 'Appointment deleted successfully' };
  },

  async getTodaysAppointments() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointments = await Appointment.find({
      scheduledDate: { $gte: today, $lt: tomorrow },
      status: { $nin: ['cancelled'] },
    })
      .populate('customerId', 'firstName lastName phone')
      .populate('vehicleId', 'make model year licensePlate')
      .populate('assignedTechnicianId', 'firstName lastName')
      .sort({ scheduledTime: 1 })
      .lean();

    return appointments;
  },

  async getAvailableSlots(date: Date, duration: number = 60) {
    // Get all appointments for the date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const bookedAppointments = await Appointment.find({
      scheduledDate: { $gte: startOfDay, $lt: endOfDay },
      status: { $nin: ['cancelled'] },
    }).select('scheduledTime estimatedDuration');

    // Define business hours (8 AM to 6 PM)
    const businessHours = {
      start: 8,
      end: 18,
    };

    // Generate available slots (30-minute intervals)
    const slots: string[] = [];
    const bookedTimes = new Set(bookedAppointments.map(a => a.scheduledTime));

    for (let hour = businessHours.start; hour < businessHours.end; hour++) {
      for (const minute of ['00', '30']) {
        const time = `${hour.toString().padStart(2, '0')}:${minute}`;
        if (!bookedTimes.has(time)) {
          slots.push(time);
        }
      }
    }

    return slots;
  },
};

export default appointmentService;
