import { Router } from 'express';
import { workshopCustomerController } from '../../controllers/workshop/customer.controller';
import { validate } from '../../middleware/validation';
import { createCustomerSchema, updateCustomerSchema } from '../../utils/validators';

const router = Router();

// Search customers (quick search for autocomplete)
router.get('/search', workshopCustomerController.searchCustomers);

// Customer CRUD
router.get('/', workshopCustomerController.getCustomers);
router.get('/:id', workshopCustomerController.getCustomer);
router.post('/', validate(createCustomerSchema), workshopCustomerController.createCustomer);
router.put('/:id', validate(updateCustomerSchema), workshopCustomerController.updateCustomer);
router.delete('/:id', workshopCustomerController.deleteCustomer);

// Customer actions
router.post('/:id/deactivate', workshopCustomerController.deactivateCustomer);
router.post('/:id/reactivate', workshopCustomerController.reactivateCustomer);
router.post('/:id/tags', workshopCustomerController.addTags);
router.delete('/:id/tags', workshopCustomerController.removeTags);

// Customer related data
router.get('/:id/vehicles', workshopCustomerController.getCustomerVehicles);
router.get('/:id/stats', workshopCustomerController.getCustomerStats);

export default router;
