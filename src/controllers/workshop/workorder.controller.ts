import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { workOrderService } from '../../services/workorder.service';

export const workshopWorkOrderController = {
  async getWorkOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, status, priority, type, customerId, vehicleId, technicianId, startDate, endDate } = req.query;

      const result = await workOrderService.getAllWorkOrders({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        status: status as any,
        priority: priority as any,
        type: type as any,
        customerId: customerId as string,
        vehicleId: vehicleId as string,
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
  },

  async getWorkOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.getWorkOrderById(id);

      res.json({
        success: true,
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async createWorkOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const workOrder = await workOrderService.createWorkOrder({
        ...req.body,
        createdBy: req.user!.userId,
      });

      res.status(201).json({
        success: true,
        message: 'Work order created successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateWorkOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.updateWorkOrder(id, req.body);

      res.json({
        success: true,
        message: 'Work order updated successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const workOrder = await workOrderService.updateWorkOrderStatus(id, status);

      res.json({
        success: true,
        message: 'Work order status updated',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteWorkOrder(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await workOrderService.deleteWorkOrder(id);

      res.json({
        success: true,
        message: 'Work order deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  async addJob(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.addJob(id, req.body);

      res.json({
        success: true,
        message: 'Job added successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async updateJob(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id, jobId } = req.params;
      const workOrder = await workOrderService.updateJob(id, jobId, req.body);

      res.json({
        success: true,
        message: 'Job updated successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async removeJob(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id, jobId } = req.params;
      const workOrder = await workOrderService.removeJob(id, jobId);

      res.json({
        success: true,
        message: 'Job removed successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async addPart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const workOrder = await workOrderService.addPart(id, req.body);

      res.json({
        success: true,
        message: 'Part added successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id, partId } = req.params;
      const workOrder = await workOrderService.updatePart(id, partId, req.body);

      res.json({
        success: true,
        message: 'Part updated successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async removePart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id, partId } = req.params;
      const workOrder = await workOrderService.removePart(id, partId);

      res.json({
        success: true,
        message: 'Part removed successfully',
        data: workOrder,
      });
    } catch (error) {
      next(error);
    }
  },

  async getActiveWorkOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const workOrders = await workOrderService.getActiveWorkOrders();

      res.json({
        success: true,
        data: workOrders,
      });
    } catch (error) {
      next(error);
    }
  },

  async getTechnicianWorkOrders(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { technicianId } = req.params;
      const { status } = req.query;

      const workOrders = await workOrderService.getTechnicianWorkOrders(
        technicianId,
        status as any
      );

      res.json({
        success: true,
        data: workOrders,
      });
    } catch (error) {
      next(error);
    }
  },

  async generateInvoice(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const invoice = await workOrderService.generateInvoiceFromWorkOrder(
        id,
        req.user!.userId
      );

      res.status(201).json({
        success: true,
        message: 'Invoice generated successfully',
        data: invoice,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default workshopWorkOrderController;
