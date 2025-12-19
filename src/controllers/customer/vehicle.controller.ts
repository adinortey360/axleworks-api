import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { vehicleService } from '../../services/vehicle.service';

export const customerVehicleController = {
  async getVehicles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, search } = req.query;

      const result = await vehicleService.getCustomerVehicles(req.user!.userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: search as string,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const vehicle = await vehicleService.getCustomerVehicle(req.user!.userId, id);

      res.json({
        success: true,
        data: vehicle,
      });
    } catch (error) {
      next(error);
    }
  },

  async createVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const vehicle = await vehicleService.createCustomerVehicle(
        req.user!.userId,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Vehicle created successfully',
        data: vehicle,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const vehicle = await vehicleService.updateCustomerVehicle(
        req.user!.userId,
        id,
        req.body
      );

      res.json({
        success: true,
        message: 'Vehicle updated successfully',
        data: vehicle,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteVehicle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await vehicleService.deleteCustomerVehicle(req.user!.userId, id);

      res.json({
        success: true,
        message: 'Vehicle deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async getVehicleStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { limit } = req.query;

      const stats = await vehicleService.getVehicleStats(
        req.user!.userId,
        id,
        { limit: limit ? Number(limit) : undefined }
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getLatestStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const stats = await vehicleService.getLatestStats(req.user!.userId, id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  async getDiagnosticCodes(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { active } = req.query;

      const codes = await vehicleService.getDiagnosticCodes(
        req.user!.userId,
        id,
        { active: active === 'true' ? true : active === 'false' ? false : undefined }
      );

      res.json({
        success: true,
        data: codes,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default customerVehicleController;
