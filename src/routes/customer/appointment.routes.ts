import { Router } from 'express';
import { customerAppointmentController } from '../../controllers/customer/appointment.controller';
import { validate } from '../../middleware/validation';
import { createAppointmentSchema, updateAppointmentSchema } from '../../utils/validators';

const router = Router();

// Get available time slots
router.get('/slots', customerAppointmentController.getAvailableSlots);

// Appointment CRUD
router.get('/', customerAppointmentController.getAppointments);
router.get('/:id', customerAppointmentController.getAppointment);
router.post('/', validate(createAppointmentSchema), customerAppointmentController.createAppointment);
router.put('/:id', validate(updateAppointmentSchema), customerAppointmentController.updateAppointment);
router.post('/:id/cancel', customerAppointmentController.cancelAppointment);

export default router;
