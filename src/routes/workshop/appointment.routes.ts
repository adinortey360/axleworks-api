import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { appointmentService } from '../../services/appointment.service';
import { validate } from '../../middleware/validation';
import { createAppointmentSchema, updateAppointmentSchema } from '../../utils/validators';

const router = Router();

// Get today's appointments
router.get('/today', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appointments = await appointmentService.getTodaysAppointments();

    res.json({
      success: true,
      data: appointments,
    });
  } catch (error) {
    next(error);
  }
});

// Get available slots
router.get('/slots', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { date, duration } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required',
      });
    }

    const slots = await appointmentService.getAvailableSlots(
      new Date(date as string),
      duration ? Number(duration) : undefined
    );

    res.json({
      success: true,
      data: slots,
    });
  } catch (error) {
    next(error);
  }
});

// Get all appointments
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, status, customerId, technicianId, startDate, endDate } = req.query;

    const result = await appointmentService.getAllAppointments({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status: status as any,
      customerId: customerId as string,
      technicianId: technicianId as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// Get single appointment
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appointment = await appointmentService.getAppointmentById(req.params.id);

    res.json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Create appointment
router.post('/', validate(createAppointmentSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appointment = await appointmentService.createAppointment(req.body);

    res.status(201).json({
      success: true,
      message: 'Appointment created successfully',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Update appointment
router.put('/:id', validate(updateAppointmentSchema), async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const appointment = await appointmentService.updateAppointment(req.params.id, req.body);

    res.json({
      success: true,
      message: 'Appointment updated successfully',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Update appointment status
router.patch('/:id/status', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status, cancelledReason } = req.body;

    const appointment = await appointmentService.updateAppointmentStatus(
      req.params.id,
      status,
      { cancelledReason }
    );

    res.json({
      success: true,
      message: 'Appointment status updated',
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Delete appointment
router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    await appointmentService.deleteAppointment(req.params.id);

    res.json({
      success: true,
      message: 'Appointment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
