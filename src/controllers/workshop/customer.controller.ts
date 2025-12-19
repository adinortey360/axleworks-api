import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { customerService } from '../../services/customer.service';

export const workshopCustomerController = {
  async getCustomers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, search, isActive, tags } = req.query;

      const result = await customerService.getAllCustomers({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search as string,
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        tags: tags ? (tags as string).split(',') : undefined,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await customerService.getCustomerById(id);

      res.json({
        success: true,
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async createCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const customer = await customerService.createCustomer(req.body);

      res.status(201).json({
        success: true,
        message: 'Customer created successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await customerService.updateCustomer(id, req.body);

      res.json({
        success: true,
        message: 'Customer updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await customerService.deleteCustomer(id);

      res.json({
        success: true,
        message: 'Customer deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async deactivateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await customerService.deactivateCustomer(id);

      res.json({
        success: true,
        message: 'Customer deactivated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async reactivateCustomer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const customer = await customerService.reactivateCustomer(id);

      res.json({
        success: true,
        message: 'Customer reactivated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCustomerVehicles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const vehicles = await customerService.getCustomerVehicles(id);

      res.json({
        success: true,
        data: vehicles,
      });
    } catch (error) {
      next(error);
    }
  },

  async getCustomerStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const stats = await customerService.getCustomerStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async searchCustomers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { q, limit } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required',
        });
      }

      const customers = await customerService.searchCustomers(
        q as string,
        limit ? Number(limit) : undefined
      );

      res.json({
        success: true,
        data: customers,
      });
    } catch (error) {
      next(error);
    }
  },

  async addTags(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tags } = req.body;

      const customer = await customerService.addTags(id, tags);

      res.json({
        success: true,
        message: 'Tags added successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },

  async removeTags(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { tags } = req.body;

      const customer = await customerService.removeTags(id, tags);

      res.json({
        success: true,
        message: 'Tags removed successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default workshopCustomerController;
