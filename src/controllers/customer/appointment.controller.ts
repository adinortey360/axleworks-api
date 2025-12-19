import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { appointmentService } from '../../services/appointment.service';

export const customerAppointmentController = {
  async getAppointments(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, status, startDate, endDate } = req.query;

      const result = await appointmentService.getCustomerAppointments(req.user!.userId, {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as any,
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
  },

  async getAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const appointment = await appointmentService.getCustomerAppointment(
        req.user!.userId,
        id
      );

      res.json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },

  async createAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const appointment = await appointmentService.createCustomerAppointment(
        req.user!.userId,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Appointment booked successfully',
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const appointment = await appointmentService.updateCustomerAppointment(
        req.user!.userId,
        id,
        req.body
      );

      res.json({
        success: true,
        message: 'Appointment updated successfully',
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },

  async cancelAppointment(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const appointment = await appointmentService.cancelCustomerAppointment(
        req.user!.userId,
        id,
        reason
      );

      res.json({
        success: true,
        message: 'Appointment cancelled successfully',
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  },

  async getAvailableSlots(req: AuthenticatedRequest, res: Response, next: NextFunction) {
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
  },
};

export default customerAppointmentController;
