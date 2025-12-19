import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Invoice, Customer } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';

const router = Router();

// Get all invoices
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, customerId, vehicleId, status } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = toObjectId(customerId as string);
    if (vehicleId) filter.vehicleId = toObjectId(vehicleId as string);
    if (status) filter.status = status;

    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate('customerId', 'firstName lastName phone email')
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
});

// Get overdue invoices
router.get('/overdue', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoices = await Invoice.find({
      status: { $in: ['sent', 'partial'] },
      dueDate: { $lt: new Date() },
    })
      .populate('customerId', 'firstName lastName phone email')
      .populate('vehicleId', 'make model year licensePlate')
      .sort({ dueDate: 1 })
      .lean();

    // Update status to overdue
    const overdueIds = invoices.map(inv => inv._id);
    await Invoice.updateMany(
      { _id: { $in: overdueIds } },
      { status: 'overdue' }
    );

    res.json({
      success: true,
      data: invoices,
      count: invoices.length,
    });
  } catch (error) {
    next(error);
  }
});

// Get single invoice
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId', 'firstName lastName phone email address')
      .populate('vehicleId')
      .populate('workOrderId')
      .populate('payments')
      .populate('createdBy', 'firstName lastName')
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
});

// Create invoice
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = new Invoice({
      ...req.body,
      createdBy: req.user!.userId,
    });
    await invoice.save();

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update invoice
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (!['draft'].includes(invoice.status)) {
      throw new BadRequestError('Cannot update this invoice');
    }

    Object.assign(invoice, req.body);
    await invoice.save();

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Add line item
router.post('/:id/items', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestError('Cannot modify sent invoice');
    }

    const item = req.body;
    item.total = item.quantity * item.unitPrice - (item.discount || 0);

    invoice.lineItems.push(item);
    await invoice.save();

    res.json({
      success: true,
      message: 'Item added successfully',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update line item
router.put('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestError('Cannot modify sent invoice');
    }

    const itemIndex = invoice.lineItems.findIndex(i => i._id?.toString() === req.params.itemId);
    if (itemIndex === -1) {
      throw new NotFoundError('Item not found');
    }

    Object.assign(invoice.lineItems[itemIndex], req.body);

    const item = invoice.lineItems[itemIndex];
    item.total = item.quantity * item.unitPrice - (item.discount || 0);

    await invoice.save();

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Remove line item
router.delete('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestError('Cannot modify sent invoice');
    }

    invoice.lineItems = invoice.lineItems.filter(i => i._id?.toString() !== req.params.itemId);
    await invoice.save();

    res.json({
      success: true,
      message: 'Item removed successfully',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Send invoice to customer
router.post('/:id/send', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestError('Invoice has already been sent');
    }

    invoice.status = 'sent';
    invoice.sentAt = new Date();
    await invoice.save();

    // TODO: Send email/notification to customer

    res.json({
      success: true,
      message: 'Invoice sent to customer',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Cancel invoice
router.post('/:id/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (['paid', 'cancelled', 'refunded'].includes(invoice.status)) {
      throw new BadRequestError('Cannot cancel this invoice');
    }

    invoice.status = 'cancelled';
    await invoice.save();

    res.json({
      success: true,
      message: 'Invoice cancelled',
      data: invoice.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete invoice
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const invoice = await Invoice.findById(req.params.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      throw new BadRequestError('Cannot delete non-draft invoice');
    }

    await Invoice.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
