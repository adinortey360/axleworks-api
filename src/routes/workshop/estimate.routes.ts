import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Estimate, WorkOrder } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';

const router = Router();

// Get all estimates
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

    const [estimates, total] = await Promise.all([
      Estimate.find(filter)
        .populate('customerId', 'firstName lastName phone email')
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
});

// Get single estimate
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id)
      .populate('customerId', 'firstName lastName phone email address')
      .populate('vehicleId')
      .populate('appointmentId')
      .populate('convertedToWorkOrderId')
      .populate('createdBy', 'firstName lastName')
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
});

// Create estimate
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = new Estimate({
      ...req.body,
      createdBy: req.user!.userId,
    });
    await estimate.save();

    res.status(201).json({
      success: true,
      message: 'Estimate created successfully',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update estimate
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    if (!['draft', 'sent'].includes(estimate.status)) {
      throw new BadRequestError('Cannot update this estimate');
    }

    Object.assign(estimate, req.body);
    await estimate.save();

    res.json({
      success: true,
      message: 'Estimate updated successfully',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Add line item
router.post('/:id/items', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    // Calculate item total
    const item = req.body;
    item.total = item.quantity * item.unitPrice - (item.discount || 0);

    estimate.lineItems.push(item);
    await estimate.save();

    res.json({
      success: true,
      message: 'Item added successfully',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update line item
router.put('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    const itemIndex = estimate.lineItems.findIndex(i => i._id?.toString() === req.params.itemId);
    if (itemIndex === -1) {
      throw new NotFoundError('Item not found');
    }

    Object.assign(estimate.lineItems[itemIndex], req.body);

    // Recalculate total
    const item = estimate.lineItems[itemIndex];
    item.total = item.quantity * item.unitPrice - (item.discount || 0);

    await estimate.save();

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Remove line item
router.delete('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    estimate.lineItems = estimate.lineItems.filter(i => i._id?.toString() !== req.params.itemId);
    await estimate.save();

    res.json({
      success: true,
      message: 'Item removed successfully',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Send estimate to customer
router.post('/:id/send', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    if (estimate.status !== 'draft') {
      throw new BadRequestError('Estimate has already been sent');
    }

    estimate.status = 'sent';
    estimate.sentAt = new Date();
    await estimate.save();

    // TODO: Send email/notification to customer

    res.json({
      success: true,
      message: 'Estimate sent to customer',
      data: estimate.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Convert estimate to work order
router.post('/:id/convert', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    if (estimate.status !== 'approved') {
      throw new BadRequestError('Estimate must be approved to convert');
    }

    if (estimate.convertedToWorkOrderId) {
      throw new BadRequestError('Estimate has already been converted');
    }

    // Create work order from estimate
    const workOrder = new WorkOrder({
      customerId: estimate.customerId,
      vehicleId: estimate.vehicleId,
      estimateId: estimate._id,
      type: req.body.type || 'repair',
      mileageIn: req.body.mileageIn,
      createdBy: req.user!.userId,
      jobs: estimate.lineItems
        .filter(item => item.type === 'labour' || item.type === 'service')
        .map(item => ({
          description: item.description,
          estimatedHours: item.quantity,
          status: 'pending',
        })),
      parts: estimate.lineItems
        .filter(item => item.type === 'part')
        .map(item => ({
          partNumber: 'TBD',
          description: item.description,
          quantity: item.quantity,
          unitCost: item.unitPrice * 0.7, // Assume 30% markup
          unitPrice: item.unitPrice,
          total: item.total,
        })),
    });

    await workOrder.save();

    // Update estimate
    estimate.status = 'converted';
    estimate.convertedToWorkOrderId = workOrder._id;
    await estimate.save();

    res.status(201).json({
      success: true,
      message: 'Work order created from estimate',
      data: {
        estimate: estimate.toJSON(),
        workOrder: workOrder.toJSON(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Delete estimate
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) {
      throw new NotFoundError('Estimate not found');
    }

    if (estimate.convertedToWorkOrderId) {
      throw new BadRequestError('Cannot delete converted estimate');
    }

    await Estimate.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Estimate deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
