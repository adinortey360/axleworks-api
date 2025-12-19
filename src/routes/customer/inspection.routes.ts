import { Router } from 'express';
import { customerInspectionController } from '../../controllers/customer/inspection.controller';

const router = Router();

// Read-only inspection routes
router.get('/', customerInspectionController.getInspections);
router.get('/:id', customerInspectionController.getInspection);

export default router;
