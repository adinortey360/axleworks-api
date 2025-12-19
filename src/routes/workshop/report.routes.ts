import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Invoice, Payment, Expense, WorkOrder, Customer, Appointment } from '../../models';
import { isManager } from '../../middleware/rbac';
import { getDayBounds, getWeekBounds, getMonthBounds } from '../../utils/helpers';

const router = Router();

// All report routes require manager access
router.use(isManager);

// Daily summary
router.get('/daily', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;
    const { start, end } = getDayBounds(date ? new Date(date as string) : new Date());

    const [
      payments,
      invoices,
      workOrdersCreated,
      workOrdersCompleted,
      appointments,
      newCustomers,
    ] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      Invoice.find({ createdAt: { $gte: start, $lt: end } }).select('total status'),
      WorkOrder.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      WorkOrder.countDocuments({ completedAt: { $gte: start, $lt: end } }),
      Appointment.find({ scheduledDate: { $gte: start, $lt: end } }).select('status'),
      Customer.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.total, 0);
    const invoiceStats = {
      created: invoices.length,
      totalValue: invoices.reduce((sum, inv) => sum + inv.total, 0),
      byStatus: invoices.reduce((acc, inv) => {
        acc[inv.status] = (acc[inv.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
    const appointmentStats = {
      total: appointments.length,
      byStatus: appointments.reduce((acc, apt) => {
        acc[apt.status] = (acc[apt.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };

    res.json({
      success: true,
      data: {
        date: start.toISOString().split('T')[0],
        revenue: {
          total: totalRevenue,
          byMethod: payments,
        },
        invoices: invoiceStats,
        workOrders: {
          created: workOrdersCreated,
          completed: workOrdersCompleted,
        },
        appointments: appointmentStats,
        newCustomers,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Weekly summary
router.get('/weekly', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { date } = req.query;
    const { start, end } = getWeekBounds(date ? new Date(date as string) : new Date());

    const [payments, expenses, workOrders, appointments] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        { $group: { _id: '$category', total: { $sum: '$amount' } } },
      ]),
      WorkOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Appointment.aggregate([
        { $match: { scheduledDate: { $gte: start, $lt: end } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);

    res.json({
      success: true,
      data: {
        weekStart: start.toISOString().split('T')[0],
        weekEnd: end.toISOString().split('T')[0],
        revenue: {
          total: totalRevenue,
          byDay: payments,
        },
        expenses: {
          total: totalExpenses,
          byCategory: expenses,
        },
        netIncome: totalRevenue - totalExpenses,
        workOrders: workOrders.reduce((acc, wo) => {
          acc[wo._id] = wo.count;
          return acc;
        }, {} as Record<string, number>),
        appointments: appointments.reduce((acc, apt) => {
          acc[apt._id] = apt.count;
          return acc;
        }, {} as Record<string, number>),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Monthly summary
router.get('/monthly', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const targetYear = year ? Number(year) : now.getFullYear();
    const targetMonth = month ? Number(month) - 1 : now.getMonth();

    const { start, end } = getMonthBounds(new Date(targetYear, targetMonth, 1));

    const [payments, expenses, invoices, workOrders, newCustomers] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end }, status: 'completed' } },
        {
          $group: {
            _id: { $dayOfMonth: '$createdAt' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: '$category',
            total: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: '$status',
            total: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
      ]),
      WorkOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalLabour: { $sum: '$labourTotal' },
            totalParts: { $sum: '$partsTotal' },
          },
        },
      ]),
      Customer.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    ]);

    const totalRevenue = payments.reduce((sum, p) => sum + p.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);
    const totalInvoiced = invoices.reduce((sum, i) => sum + i.total, 0);

    res.json({
      success: true,
      data: {
        month: targetMonth + 1,
        year: targetYear,
        revenue: {
          total: totalRevenue,
          byDay: payments,
        },
        expenses: {
          total: totalExpenses,
          byCategory: expenses,
        },
        invoices: {
          total: totalInvoiced,
          byStatus: invoices,
        },
        netIncome: totalRevenue - totalExpenses,
        workOrders: {
          byType: workOrders,
          totalLabour: workOrders.reduce((sum, wo) => sum + (wo.totalLabour || 0), 0),
          totalParts: workOrders.reduce((sum, wo) => sum + (wo.totalParts || 0), 0),
        },
        newCustomers,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Profit & Loss report
router.get('/profit-loss', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const [revenue, expenses] = await Promise.all([
      Payment.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: 'completed' } },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: { month: { $month: '$date' }, category: '$category' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.month': 1 } },
      ]),
    ]);

    const totalRevenue = revenue.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.total, 0);

    // Group expenses by category
    const expensesByCategory = expenses.reduce((acc, e) => {
      const cat = e._id.category;
      acc[cat] = (acc[cat] || 0) + e.total;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        revenue: {
          total: totalRevenue,
          byMonth: revenue,
        },
        expenses: {
          total: totalExpenses,
          byCategory: expensesByCategory,
        },
        grossProfit: totalRevenue - totalExpenses,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(2) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Customer analytics
router.get('/customers', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [
      totalCustomers,
      activeCustomers,
      topSpenders,
      customersBySource,
      recentCustomers,
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ isActive: true }),
      Customer.find()
        .sort({ totalSpent: -1 })
        .limit(10)
        .select('firstName lastName totalSpent visitCount')
        .lean(),
      Customer.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      Customer.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    const avgSpending = await Customer.aggregate([
      { $match: { totalSpent: { $gt: 0 } } },
      { $group: { _id: null, avg: { $avg: '$totalSpent' } } },
    ]);

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        newCustomersLast30Days: recentCustomers,
        averageSpending: avgSpending[0]?.avg || 0,
        topSpenders,
        bySource: customersBySource,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Service analytics
router.get('/services', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const [workOrdersByType, appointmentsByService, avgCompletionTime] = await Promise.all([
      WorkOrder.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      Appointment.aggregate([
        { $match: { scheduledDate: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: '$serviceType',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      WorkOrder.aggregate([
        {
          $match: {
            status: 'completed',
            startedAt: { $exists: true },
            completedAt: { $exists: true },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $project: {
            duration: {
              $divide: [
                { $subtract: ['$completedAt', '$startedAt'] },
                1000 * 60 * 60, // Convert to hours
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgHours: { $avg: '$duration' },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        period: {
          start: start.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        },
        workOrders: {
          byType: workOrdersByType,
          total: workOrdersByType.reduce((sum, wo) => sum + wo.count, 0),
          totalRevenue: workOrdersByType.reduce((sum, wo) => sum + wo.revenue, 0),
        },
        appointments: {
          byService: appointmentsByService,
          total: appointmentsByService.reduce((sum, apt) => sum + apt.count, 0),
        },
        averageCompletionTime: avgCompletionTime[0]?.avgHours || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
