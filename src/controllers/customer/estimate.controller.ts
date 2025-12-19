import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Estimate, Customer } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo } from '../../utils/helpers';

export const customerEstimateController = {
  async getEstimates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, status, vehicleId } = req.query;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const { page: pageNum, limit: limitNum, skip } = parsePagination(
        page ? Number(page) : undefined,
        limit ? Number(limit) : undefined
      );

      const filter: Record<string, unknown> = { customerId: customer._id };
      if (status) {
        filter.status = status;
      }
      if (vehicleId) {
        filter.vehicleId = vehicleId;
      }

      const [estimates, total] = await Promise.all([
        Estimate.find(filter)
          .populate('vehicleId', 'make model year licensePlate')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Estimate.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: estimates,
        pagination: buildPaginationInfo(total, pageNum, limitNum),
      });
    } catch (error) {
      next(error);
    }
  },

  async getEstimate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const estimate = await Estimate.findOne({
        _id: id,
        customerId: customer._id,
      })
        .populate('vehicleId', 'make model year licensePlate vin')
        .lean();

      if (!estimate) {
        throw new NotFoundError('Estimate not found');
      }

      res.json({
        success: true,
        data: estimate,
      });
    } catch (error) {
      next(error);
    }
  },

  async approveEstimate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const estimate = await Estimate.findOne({
        _id: id,
        customerId: customer._id,
      });

      if (!estimate) {
        throw new NotFoundError('Estimate not found');
      }

      if (estimate.status !== 'sent') {
        throw new BadRequestError('This estimate cannot be approved');
      }

      estimate.status = 'approved';
      estimate.approvedAt = new Date();
      await estimate.save();

      res.json({
        success: true,
        message: 'Estimate approved successfully',
        data: estimate.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  },

  async rejectEstimate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const estimate = await Estimate.findOne({
        _id: id,
        customerId: customer._id,
      });

      if (!estimate) {
        throw new NotFoundError('Estimate not found');
      }

      if (estimate.status !== 'sent') {
        throw new BadRequestError('This estimate cannot be rejected');
      }

      estimate.status = 'rejected';
      estimate.rejectedAt = new Date();
      estimate.rejectionReason = reason;
      await estimate.save();

      res.json({
        success: true,
        message: 'Estimate rejected',
        data: estimate.toJSON(),
      });
    } catch (error) {
      next(error);
    }
  },
};

export default customerEstimateController;
