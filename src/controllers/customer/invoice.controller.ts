import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Invoice, Customer } from '../../models';
import { NotFoundError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo } from '../../utils/helpers';

export const customerInvoiceController = {
  async getInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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

      const [invoices, total] = await Promise.all([
        Invoice.find(filter)
          .populate('vehicleId', 'make model year licensePlate')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Invoice.countDocuments(filter),
      ]);

      res.json({
        success: true,
        data: invoices,
        pagination: buildPaginationInfo(total, pageNum, limitNum),
      });
    } catch (error) {
      next(error);
    }
  },

  async getInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const invoice = await Invoice.findOne({
        _id: id,
        customerId: customer._id,
      })
        .populate('vehicleId', 'make model year licensePlate vin')
        .populate('workOrderId')
        .populate('payments')
        .lean();

      if (!invoice) {
        throw new NotFoundError('Invoice not found');
      }

      res.json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  },

  async getUnpaidInvoices(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const customer = await Customer.findOne({ userId: req.user!.userId });
      if (!customer) {
        throw new NotFoundError('Customer profile not found');
      }

      const invoices = await Invoice.find({
        customerId: customer._id,
        status: { $in: ['sent', 'partial', 'overdue'] },
      })
        .populate('vehicleId', 'make model year licensePlate')
        .sort({ dueDate: 1 })
        .lean();

      const totalDue = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);

      res.json({
        success: true,
        data: {
          invoices,
          totalDue,
          count: invoices.length,
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default customerInvoiceController;
