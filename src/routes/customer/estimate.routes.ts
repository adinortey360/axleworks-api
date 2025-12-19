import { Router } from 'express';
import { customerEstimateController } from '../../controllers/customer/estimate.controller';

const router = Router();

// Estimate routes (mostly read-only, with approve/reject actions)
router.get('/', customerEstimateController.getEstimates);
router.get('/:id', customerEstimateController.getEstimate);
router.post('/:id/approve', customerEstimateController.approveEstimate);
router.post('/:id/reject', customerEstimateController.rejectEstimate);

export default router;
