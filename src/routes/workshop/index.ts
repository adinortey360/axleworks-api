import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize, isStaff, isManager, isAdmin } from '../../middleware/rbac';
import customerRoutes from './customer.routes';
import vehicleRoutes from './vehicle.routes';
import workOrderRoutes from './workorder.routes';
import inspectionRoutes from './inspection.routes';
import estimateRoutes from './estimate.routes';
import invoiceRoutes from './invoice.routes';
import paymentRoutes from './payment.routes';
import inventoryRoutes from './inventory.routes';
import supplierRoutes from './supplier.routes';
import employeeRoutes from './employee.routes';
import expenseRoutes from './expense.routes';
import reportRoutes from './report.routes';

const router = Router();

// All workshop routes require authentication
router.use(authenticate);
router.use(authorize('technician', 'manager', 'admin'));

// Mount sub-routes
router.use('/customers', customerRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/workorders', workOrderRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/estimates', estimateRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/employees', employeeRoutes);
router.use('/expenses', expenseRoutes);
router.use('/reports', reportRoutes);

export default router;
