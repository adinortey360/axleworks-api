import { Router } from 'express';
import { customerInvoiceController } from '../../controllers/customer/invoice.controller';

const router = Router();

// Read-only invoice routes
router.get('/', customerInvoiceController.getInvoices);
router.get('/unpaid', customerInvoiceController.getUnpaidInvoices);
router.get('/:id', customerInvoiceController.getInvoice);

export default router;
