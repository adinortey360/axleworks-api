import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Supplier, InventoryItem } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo } from '../../utils/helpers';
import { isManager } from '../../middleware/rbac';

const router = Router();

// Get all suppliers
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search, category, isActive } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.categories = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [suppliers, total] = await Promise.all([
      Supplier.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Supplier.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: suppliers,
      pagination: buildPaginationInfo(total, pageNum, limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// Get single supplier
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = await Supplier.findById(req.params.id).lean();

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    // Get supplier's inventory items
    const items = await InventoryItem.find({ supplierId: req.params.id })
      .select('partNumber name quantity unitCost')
      .lean();

    res.json({
      success: true,
      data: {
        ...supplier,
        inventoryItems: items,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create supplier
router.post('/', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: supplier.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update supplier
router.put('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({
      success: true,
      message: 'Supplier updated successfully',
      data: supplier.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Deactivate supplier
router.post('/:id/deactivate', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({
      success: true,
      message: 'Supplier deactivated',
      data: supplier.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Reactivate supplier
router.post('/:id/reactivate', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({
      success: true,
      message: 'Supplier reactivated',
      data: supplier.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete supplier
router.delete('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Check if supplier has inventory items
    const itemCount = await InventoryItem.countDocuments({ supplierId: req.params.id });
    if (itemCount > 0) {
      throw new BadRequestError('Cannot delete supplier with linked inventory items');
    }

    const supplier = await Supplier.findByIdAndDelete(req.params.id);

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    res.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
