import { Vehicle, VehicleStats, DiagnosticCode, Customer } from '../models';
import { IVehicle, IVehicleStats, IDiagnosticCode } from '../types';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../utils/helpers';

interface CreateVehicleInput {
  customerId: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  licensePlate?: string;
  color?: string;
  fuelType?: string;
  vehicleType?: string;
  mileage?: number;
  photo?: string;
}

interface VehicleQuery {
  customerId?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export const vehicleService = {
  // Customer-facing methods
  async getCustomerVehicles(userId: string, query: VehicleQuery) {
    // Find customer by userId
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = { customerId: customer._id };

    if (query.search) {
      filter.$or = [
        { make: { $regex: query.search, $options: 'i' } },
        { model: { $regex: query.search, $options: 'i' } },
        { licensePlate: { $regex: query.search, $options: 'i' } },
        { vin: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    return {
      data: vehicles,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getCustomerVehicle(userId: string, vehicleId: string) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      customerId: customer._id,
    }).lean();

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return vehicle;
  },

  async createCustomerVehicle(userId: string, input: Omit<CreateVehicleInput, 'customerId'>) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const vehicle = new Vehicle({
      ...input,
      customerId: customer._id,
    });

    await vehicle.save();

    // Add vehicle to customer's vehicles array
    await Customer.findByIdAndUpdate(customer._id, {
      $push: { vehicles: vehicle._id },
    });

    return vehicle.toJSON();
  },

  async updateCustomerVehicle(userId: string, vehicleId: string, updates: Partial<CreateVehicleInput>) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: vehicleId, customerId: customer._id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return vehicle.toJSON();
  },

  async deleteCustomerVehicle(userId: string, vehicleId: string) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    const vehicle = await Vehicle.findOneAndDelete({
      _id: vehicleId,
      customerId: customer._id,
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    // Remove vehicle from customer's vehicles array
    await Customer.findByIdAndUpdate(customer._id, {
      $pull: { vehicles: vehicle._id },
    });

    return { message: 'Vehicle deleted successfully' };
  },

  // OBD/Stats methods
  async getVehicleStats(userId: string, vehicleId: string, query: { limit?: number }) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    // Verify ownership
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      customerId: customer._id,
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const limit = Math.min(query.limit || 100, 1000);

    const stats = await VehicleStats.find({ vehicleId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return stats;
  },

  async getLatestStats(userId: string, vehicleId: string) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    // Verify ownership
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      customerId: customer._id,
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const stats = await VehicleStats.findOne({ vehicleId })
      .sort({ timestamp: -1 })
      .lean();

    return stats;
  },

  async getDiagnosticCodes(userId: string, vehicleId: string, query: { active?: boolean }) {
    const customer = await Customer.findOne({ userId });
    if (!customer) {
      throw new NotFoundError('Customer profile not found');
    }

    // Verify ownership
    const vehicle = await Vehicle.findOne({
      _id: vehicleId,
      customerId: customer._id,
    });

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    const filter: Record<string, unknown> = { vehicleId };
    if (query.active !== undefined) {
      filter.isActive = query.active;
    }

    const codes = await DiagnosticCode.find(filter)
      .sort({ detectedAt: -1 })
      .lean();

    return codes;
  },

  // Workshop-facing methods
  async getAllVehicles(query: VehicleQuery) {
    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = {};

    if (query.customerId) {
      filter.customerId = toObjectId(query.customerId);
    }

    if (query.search) {
      filter.$or = [
        { make: { $regex: query.search, $options: 'i' } },
        { model: { $regex: query.search, $options: 'i' } },
        { licensePlate: { $regex: query.search, $options: 'i' } },
        { vin: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('customerId', 'firstName lastName phone email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Vehicle.countDocuments(filter),
    ]);

    return {
      data: vehicles,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getVehicleById(vehicleId: string) {
    const vehicle = await Vehicle.findById(vehicleId)
      .populate('customerId', 'firstName lastName phone email')
      .lean();

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return vehicle;
  },

  async createVehicle(input: CreateVehicleInput) {
    const vehicle = new Vehicle(input);
    await vehicle.save();

    // Add vehicle to customer's vehicles array
    await Customer.findByIdAndUpdate(input.customerId, {
      $push: { vehicles: vehicle._id },
    });

    return vehicle.toJSON();
  },

  async updateVehicle(vehicleId: string, updates: Partial<CreateVehicleInput>) {
    const vehicle = await Vehicle.findByIdAndUpdate(
      vehicleId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    return vehicle.toJSON();
  },

  async deleteVehicle(vehicleId: string) {
    const vehicle = await Vehicle.findByIdAndDelete(vehicleId);

    if (!vehicle) {
      throw new NotFoundError('Vehicle not found');
    }

    // Remove vehicle from customer's vehicles array
    await Customer.findByIdAndUpdate(vehicle.customerId, {
      $pull: { vehicles: vehicle._id },
    });

    return { message: 'Vehicle deleted successfully' };
  },
};

export default vehicleService;
