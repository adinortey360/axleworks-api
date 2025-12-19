import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { vehicleService } from '../../services/vehicle.service';
import { validate } from '../../middleware/validation';
import { createVehicleSchema, updateVehicleSchema } from '../../utils/validators';

const router = Router();

// Get all vehicles
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search, customerId } = req.query;

    const result = await vehicleService.getAllVehicles({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search: search as string,
      customerId: customerId as string,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Get single vehicle
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id);

    res.json({
      success: true,
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
});

// Create vehicle
router.post('/', validate(createVehicleSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await vehicleService.createVehicle(req.body);

    res.status(201).json({
      success: true,
      message: 'Vehicle created successfully',
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
});

// Update vehicle
router.put('/:id', validate(updateVehicleSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const vehicle = await vehicleService.updateVehicle(req.params.id, req.body);

    res.json({
      success: true,
      message: 'Vehicle updated successfully',
      data: vehicle,
    });
  } catch (error) {
    next(error);
  }
});

// Delete vehicle
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await vehicleService.deleteVehicle(req.params.id);

    res.json({
      success: true,
      message: 'Vehicle deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
