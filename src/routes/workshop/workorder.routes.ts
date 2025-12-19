import { Router } from 'express';
import { workshopWorkOrderController } from '../../controllers/workshop/workorder.controller';
import { validate } from '../../middleware/validation';
import { createWorkOrderSchema, updateWorkOrderSchema } from '../../utils/validators';

const router = Router();

// Special queries
router.get('/active', workshopWorkOrderController.getActiveWorkOrders);
router.get('/technician/:technicianId', workshopWorkOrderController.getTechnicianWorkOrders);

// Work order CRUD
router.get('/', workshopWorkOrderController.getWorkOrders);
router.get('/:id', workshopWorkOrderController.getWorkOrder);
router.post('/', validate(createWorkOrderSchema), workshopWorkOrderController.createWorkOrder);
router.put('/:id', validate(updateWorkOrderSchema), workshopWorkOrderController.updateWorkOrder);
router.delete('/:id', workshopWorkOrderController.deleteWorkOrder);

// Status management
router.patch('/:id/status', workshopWorkOrderController.updateStatus);

// Job management
router.post('/:id/jobs', workshopWorkOrderController.addJob);
router.put('/:id/jobs/:jobId', workshopWorkOrderController.updateJob);
router.delete('/:id/jobs/:jobId', workshopWorkOrderController.removeJob);

// Parts management
router.post('/:id/parts', workshopWorkOrderController.addPart);
router.put('/:id/parts/:partId', workshopWorkOrderController.updatePart);
router.delete('/:id/parts/:partId', workshopWorkOrderController.removePart);

// Invoice generation
router.post('/:id/invoice', workshopWorkOrderController.generateInvoice);

export default router;
