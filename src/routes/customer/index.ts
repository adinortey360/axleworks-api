import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import vehicleRoutes from './vehicle.routes';
import appointmentRoutes from './appointment.routes';
import inspectionRoutes from './inspection.routes';
import estimateRoutes from './estimate.routes';
import invoiceRoutes from './invoice.routes';

const router = Router();

// All customer routes require authentication
router.use(authenticate);
router.use(authorize('customer', 'admin'));

// Mount sub-routes
router.use('/vehicles', vehicleRoutes);
router.use('/appointments', appointmentRoutes);
router.use('/inspections', inspectionRoutes);
router.use('/estimates', estimateRoutes);
router.use('/invoices', invoiceRoutes);

export default router;
