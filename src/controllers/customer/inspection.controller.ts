import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InspectionHistory, Customer } from '../../models';
import { NotFoundError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo } from '../../utils/helpers';

export const customerInspectionController = {
  async getInspections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, vehicleId } = req.query;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const { page: pageNum, limit: limitNum, skip } = parsePagination(
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
      );

      const filter: Record<string, unknown> = { customerId: customer._id };
      if (vehicleId) {
        filter.vehicleId = vehicleId;
      }

      const [inspections, total] = await Promise.all([
        InspectionHistory.find(filter)
          .populate('vehicleId', 'make model year licensePlate')
          .populate('inspectedBy', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        InspectionHistory.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: inspections,
        pagination: buildPaginationInfo(total, pageNum, limitNum),
      });
    } catch (error) {
      next(error);
    }
  },

  async getInspection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const inspection = await InspectionHistory.findOne({
        _id: id,
        customerId: customer._id,
      })
        .populate('vehicleId', 'make model year licensePlate vin')
        .populate('inspectedBy', 'firstName lastName')
        .lean();

      if (!inspection) {
        throw new NotFoundError('Inspection not found');
      }

      res.json({
        success: true,
        data: inspection,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default customerInspectionController;
