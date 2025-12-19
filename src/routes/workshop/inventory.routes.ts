import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { InventoryItem } from '../../models';
import { NotFoundError, BadRequestError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';
import { isManager } from '../../middleware/rbac';

const router = Router();

// Get all inventory items
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search, category, supplierId, lowStock, isActive } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { partNumber: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    if (category) filter.category = category;
    if (supplierId) filter.supplierId = toObjectId(supplierId as string);
    if (lowStock === 'true') {
      filter.$expr = { $lte: ['$quantity', '$minQuantity'] };
    }
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const [items, total] = await Promise.all([
      InventoryItem.find(filter)
        .populate('supplierId', 'name')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      InventoryItem.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: buildPaginationInfo(total, pageNum, limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// Get low stock items
router.get('/low-stock', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const items = await InventoryItem.find({
      $expr: { $lte: ['$quantity', '$minQuantity'] },
      isActive: true,
    })
      .populate('supplierId', 'name phone')
      .sort({ quantity: 1 })
      .lean();

    res.json({
      success: true,
      data: items,
      count: items.length,
    });
  } catch (error) {
    next(error);
  }
});

// Search inventory (quick search for autocomplete)
router.get('/search', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required',
      });
    }

    const items = await InventoryItem.find({
      $or: [
        { partNumber: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { barcode: q },
      ],
      isActive: true,
    })
      .select('partNumber name quantity unitPrice category')
      .limit(limit ? Number(limit) : 10)
      .lean();

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

// Get single inventory item
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const item = await InventoryItem.findById(req.params.id)
      .populate('supplierId')
      .lean();

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

// Create inventory item
router.post('/', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Check for duplicate part number
    const existing = await InventoryItem.findOne({ partNumber: req.body.partNumber?.toUpperCase() });
    if (existing) {
      throw new BadRequestError('Part number already exists');
    }

    const item = new InventoryItem(req.body);
    await item.save();

    res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: item.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update inventory item
router.put('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Check for duplicate part number
    if (req.body.partNumber) {
      const existing = await InventoryItem.findOne({
        partNumber: req.body.partNumber.toUpperCase(),
        _id: { $ne: req.params.id },
      });
      if (existing) {
        throw new BadRequestError('Part number already exists');
      }
    }

    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    res.json({
      success: true,
      message: 'Inventory item updated successfully',
      data: item.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Adjust stock
router.post('/:id/adjust', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { adjustment, reason } = req.body;

    if (typeof adjustment !== 'number') {
      throw new BadRequestError('Adjustment must be a number');
    }

    const item = await InventoryItem.findById(req.params.id);

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    const newQuantity = item.quantity + adjustment;
    if (newQuantity < 0) {
      throw new BadRequestError('Cannot reduce stock below zero');
    }

    item.quantity = newQuantity;
    if (adjustment > 0) {
      item.lastRestockedAt = new Date();
    }
    await item.save();

    res.json({
      success: true,
      message: `Stock ${adjustment > 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment)}`,
      data: {
        partNumber: item.partNumber,
        previousQuantity: item.quantity - adjustment,
        newQuantity: item.quantity,
        reason,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Restock item
router.post('/:id/restock', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { quantity, unitCost } = req.body;

    if (!quantity || quantity <= 0) {
      throw new BadRequestError('Quantity must be a positive number');
    }

    const item = await InventoryItem.findById(req.params.id);

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    item.quantity += quantity;
    if (unitCost) {
      item.unitCost = unitCost;
    }
    item.lastRestockedAt = new Date();
    await item.save();

    res.json({
      success: true,
      message: `Restocked ${quantity} units`,
      data: item.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Deactivate item
router.post('/:id/deactivate', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    res.json({
      success: true,
      message: 'Inventory item deactivated',
      data: item.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete item (only if zero stock)
router.delete('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const item = await InventoryItem.findById(req.params.id);

    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    if (item.quantity > 0) {
      throw new BadRequestError('Cannot delete item with stock. Deactivate instead.');
    }

    await InventoryItem.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Inventory item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Get inventory value summary
router.get('/summary/value', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const summary = await InventoryItem.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          totalItems: { $sum: 1 },
          totalQuantity: { $sum: '$quantity' },
          totalValue: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
        },
      },
      { $sort: { totalValue: -1 } },
    ]);

    const totals = summary.reduce(
      (acc, cat) => ({
        totalItems: acc.totalItems + cat.totalItems,
        totalQuantity: acc.totalQuantity + cat.totalQuantity,
        totalValue: acc.totalValue + cat.totalValue,
      }),
      { totalItems: 0, totalQuantity: 0, totalValue: 0 }
    );

    res.json({
      success: true,
      data: {
        byCategory: summary,
        totals,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
