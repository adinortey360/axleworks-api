import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Expense } from '../../models';
import { NotFoundError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo, toObjectId } from '../../utils/helpers';
import { isManager } from '../../middleware/rbac';

const router = Router();

// Get all expenses
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, category, supplierId, startDate, endDate, taxDeductible } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};

    if (category) filter.category = category;
    if (supplierId) filter.supplierId = toObjectId(supplierId as string);
    if (taxDeductible !== undefined) filter.taxDeductible = taxDeductible === 'true';
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) (filter.date as Record<string, Date>).$gte = new Date(startDate as string);
      if (endDate) (filter.date as Record<string, Date>).$lte = new Date(endDate as string);
    }

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .populate('supplierId', 'name')
        .populate('createdBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Expense.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: expenses,
      pagination: buildPaginationInfo(total, pageNum, limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// Get expenses summary by category
router.get('/summary', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: Record<string, Date> = {};
    if (startDate) dateFilter.$gte = new Date(startDate as string);
    if (endDate) dateFilter.$lte = new Date(endDate as string);

    const matchStage: Record<string, unknown> = {};
    if (Object.keys(dateFilter).length > 0) {
      matchStage.date = dateFilter;
    }

    const summary = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          taxDeductible: {
            $sum: { $cond: ['$taxDeductible', '$amount', 0] },
          },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const totals = summary.reduce(
      (acc, cat) => ({
        totalAmount: acc.totalAmount + cat.totalAmount,
        count: acc.count + cat.count,
        taxDeductible: acc.taxDeductible + cat.taxDeductible,
      }),
      { totalAmount: 0, count: 0, taxDeductible: 0 }
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

// Get single expense
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('supplierId')
      .populate('createdBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .lean();

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    next(error);
  }
});

// Create expense
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expense = new Expense({
      ...req.body,
      createdBy: req.user!.userId,
    });
    await expense.save();

    res.status(201).json({
      success: true,
      message: 'Expense recorded successfully',
      data: expense.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update expense
router.put('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: expense.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Approve expense
router.post('/:id/approve', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expense = await Expense.findByIdAndUpdate(
      req.params.id,
      {
        approvedBy: req.user!.userId,
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    res.json({
      success: true,
      message: 'Expense approved',
      data: expense.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete expense
router.delete('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const expense = await Expense.findByIdAndDelete(req.params.id);

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
