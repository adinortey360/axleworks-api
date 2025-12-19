import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Payment, Invoice, Customer } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';
import { customerService } from '../../services/customer.service';

const router = Router();

// Get all payments
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, customerId, invoiceId, status, method, startDate, endDate } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = toObjectId(customerId as string);
    if (invoiceId) filter.invoiceId = toObjectId(invoiceId as string);
    if (status) filter.status = status;
    if (method) filter.method = method;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) (filter.createdAt as Record<string, Date>).$gte = new Date(startDate as string);
      if (endDate) (filter.createdAt as Record<string, Date>).$lte = new Date(endDate as string);
    }

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('customerId', 'firstName lastName phone')
        .populate('invoiceId', 'invoiceNumber total')
        .populate('processedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Payment.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: buildPaginationInfo(total, pageNum, limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// Get single payment
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('customerId', 'firstName lastName phone email')
      .populate('invoiceId')
      .populate('processedBy', 'firstName lastName')
      .lean();

    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
});

// Record payment
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { invoiceId, amount, method, reference, notes } = req.body;

    // Get invoice
    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
      throw new BadRequestError('Cannot add payment to this invoice');
    }

    if (amount > invoice.amountDue) {
      throw new BadRequestError('Payment amount exceeds amount due');
    }

    // Create payment
    const payment = new Payment({
      invoiceId,
      customerId: invoice.customerId,
      amount,
      method,
      reference,
      notes,
      status: 'completed',
      processedBy: req.user!.userId,
      processedAt: new Date(),
    });

    await payment.save();

    // Update invoice
    invoice.amountPaid += amount;
    invoice.payments.push(payment._id);
    await invoice.save();

    // Update customer stats
    await customerService.updateCustomerStats(invoice.customerId.toString(), amount);

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: payment.toJSON(),
        invoice: {
          amountPaid: invoice.amountPaid,
          amountDue: invoice.amountDue,
          status: invoice.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Refund payment
router.post('/:id/refund', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }

    if (payment.status !== 'completed') {
      throw new BadRequestError('Can only refund completed payments');
    }

    // Update payment status
    payment.status = 'refunded';
    payment.notes = `${payment.notes || ''}\nRefund reason: ${reason}`;
    await payment.save();

    // Update invoice
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice) {
      invoice.amountPaid -= payment.amount;
      if (invoice.amountPaid <= 0) {
        invoice.status = 'refunded';
      } else {
        invoice.status = 'partial';
      }
      await invoice.save();
    }

    res.json({
      success: true,
      message: 'Payment refunded',
      data: payment.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Get payments summary
router.get('/summary/daily', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;
    const targetDate = date ? new Date(date as string) : new Date();

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const payments = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lt: endOfDay },
          status: 'completed',
        },
      },
      {
        $group: {
          _id: '$method',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
    ]);

    const totalAmount = payments.reduce((sum, p) => sum + p.total, 0);
    const totalCount = payments.reduce((sum, p) => sum + p.count, 0);

    res.json({
      success: true,
      data: {
        date: startOfDay.toISOString().split('T')[0],
        byMethod: payments,
        totalAmount,
        totalCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
