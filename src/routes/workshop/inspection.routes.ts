import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InspectionHistory, Employee } from '../../models';
import { NotFoundError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';

const router = Router();

// Get all inspections
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, vehicleId, customerId, type, status } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};
    if (vehicleId) filter.vehicleId = toObjectId(vehicleId as string);
    if (customerId) filter.customerId = toObjectId(customerId as string);
    if (type) filter.type = type;
    if (status) filter.status = status;

    const [inspections, total] = await Promise.all([
      InspectionHistory.find(filter)
        .populate('vehicleId', 'make model year licensePlate')
        .populate('customerId', 'firstName lastName phone')
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
});

// Get single inspection
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findById(req.params.id)
      .populate('vehicleId')
      .populate('customerId', 'firstName lastName phone email')
      .populate('inspectedBy', 'firstName lastName')
      .populate('workOrderId')
      .populate('estimateId')
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
});

// Create inspection
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = new InspectionHistory(req.body);
    await inspection.save();

    res.status(201).json({
      success: true,
      message: 'Inspection created successfully',
      data: inspection.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update inspection
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!inspection) {
      throw new NotFoundError('Inspection not found');
    }

    res.json({
      success: true,
      message: 'Inspection updated successfully',
      data: inspection.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Add inspection item
router.post('/:id/items', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findById(req.params.id);

    if (!inspection) {
      throw new NotFoundError('Inspection not found');
    }

    inspection.items.push(req.body);
    await inspection.save();

    res.json({
      success: true,
      message: 'Item added successfully',
      data: inspection.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update inspection item
router.put('/:id/items/:itemId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findById(req.params.id);

    if (!inspection) {
      throw new NotFoundError('Inspection not found');
    }

    const itemIndex = inspection.items.findIndex(i => i._id?.toString() === req.params.itemId);
    if (itemIndex === -1) {
      throw new NotFoundError('Item not found');
    }

    Object.assign(inspection.items[itemIndex], req.body);
    await inspection.save();

    res.json({
      success: true,
      message: 'Item updated successfully',
      data: inspection.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Complete inspection
router.post('/:id/complete', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findById(req.params.id);

    if (!inspection) {
      throw new NotFoundError('Inspection not found');
    }

    inspection.status = 'completed';
    inspection.completedAt = new Date();
    if (req.body.summary) inspection.summary = req.body.summary;
    if (req.body.recommendations) inspection.recommendations = req.body.recommendations;

    await inspection.save();

    res.json({
      success: true,
      message: 'Inspection completed',
      data: inspection.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete inspection
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const inspection = await InspectionHistory.findByIdAndDelete(req.params.id);

    if (!inspection) {
      throw new NotFoundError('Inspection not found');
    }

    res.json({
      success: true,
      message: 'Inspection deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
