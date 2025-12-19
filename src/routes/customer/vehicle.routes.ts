import { Router } from 'express';
import { customerVehicleController } from '../../controllers/customer/vehicle.controller';
import { validate } from '../../middleware/validation';
import { createVehicleSchema, updateVehicleSchema } from '../../utils/validators';

const router = Router();

// Vehicle CRUD
router.get('/', customerVehicleController.getVehicles);
router.get('/:id', customerVehicleController.getVehicle);
router.post('/', validate(createVehicleSchema), customerVehicleController.createVehicle);
router.put('/:id', validate(updateVehicleSchema), customerVehicleController.updateVehicle);
router.delete('/:id', customerVehicleController.deleteVehicle);

// OBD Data
router.get('/:id/stats', customerVehicleController.getVehicleStats);
router.get('/:id/stats/latest', customerVehicleController.getLatestStats);
router.get('/:id/codes', customerVehicleController.getDiagnosticCodes);

export default router;
