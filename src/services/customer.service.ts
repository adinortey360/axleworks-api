import { Customer, User, Vehicle } from '../models';
import { ICustomer, CustomerSource } from '../types';
import { NotFoundError, ConflictError } from '../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId, buildSearchFilter } from '../utils/helpers';

interface CreateCustomerInput {
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
  notes?: string;
  tags?: string[];
  source?: CustomerSource;
}

interface CustomerQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  tags?: string[];
}

export const customerService = {
  async getAllCustomers(query: CustomerQuery) {
    const { page, limit, skip } = parsePagination(query.page, query.limit);

    const filter: Record<string, unknown> = {};

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.tags && query.tags.length > 0) {
      filter.tags = { $in: query.tags };
    }

    if (query.search) {
      filter.$or = [
        { firstName: { $regex: query.search, $options: 'i' } },
        { lastName: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [customers, total] = await Promise.all([
      Customer.find(filter)
        .populate('vehicles', 'make model year licensePlate')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(filter),
    ]);

    return {
      data: customers,
      pagination: buildPaginationInfo(total, page, limit),
    };
  },

  async getCustomerById(customerId: string) {
    const customer = await Customer.findById(customerId)
      .populate('vehicles')
      .populate('userId', 'email lastLogin')
      .lean();

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer;
  },

  async createCustomer(input: CreateCustomerInput) {
    // Check if phone already exists
    const existingCustomer = await Customer.findOne({ phone: input.phone });
    if (existingCustomer) {
      throw new ConflictError('Customer with this phone number already exists');
    }

    const customer = new Customer(input);
    await customer.save();

    return customer.toJSON();
  },

  async updateCustomer(customerId: string, updates: Partial<CreateCustomerInput>) {
    // Check phone uniqueness if updating
    if (updates.phone) {
      const existingCustomer = await Customer.findOne({
        phone: updates.phone,
        _id: { $ne: customerId },
      });
      if (existingCustomer) {
        throw new ConflictError('Another customer with this phone number already exists');
      }
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async deleteCustomer(customerId: string) {
    const customer = await Customer.findByIdAndDelete(customerId);

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    // Optionally deactivate associated user account
    if (customer.userId) {
      await User.findByIdAndUpdate(customer.userId, { isActive: false });
    }

    return { message: 'Customer deleted successfully' };
  },

  async deactivateCustomer(customerId: string) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { isActive: false },
      { new: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async reactivateCustomer(customerId: string) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { isActive: true },
      { new: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async addTags(customerId: string, tags: string[]) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $addToSet: { tags: { $each: tags } } },
      { new: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async removeTags(customerId: string, tags: string[]) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $pull: { tags: { $in: tags } } },
      { new: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async getCustomerVehicles(customerId: string) {
    const vehicles = await Vehicle.find({ customerId }).lean();
    return vehicles;
  },

  async getCustomerStats(customerId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const vehicles = await Vehicle.countDocuments({ customerId });

    return {
      totalSpent: customer.totalSpent,
      visitCount: customer.visitCount,
      lastVisit: customer.lastVisit,
      vehicleCount: vehicles,
      memberSince: customer.createdAt,
    };
  },

  async updateCustomerStats(customerId: string, amount: number) {
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      {
        $inc: { totalSpent: amount, visitCount: 1 },
        lastVisit: new Date(),
      },
      { new: true }
    );

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    return customer.toJSON();
  },

  async searchCustomers(searchTerm: string, limit: number = 10) {
    const customers = await Customer.find({
      $or: [
        { firstName: { $regex: searchTerm, $options: 'i' } },
        { lastName: { $regex: searchTerm, $options: 'i' } },
        { phone: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } },
      ],
      isActive: true,
    })
      .select('firstName lastName phone email')
      .limit(limit)
      .lean();

    return customers;
  },
};

export default customerService;
