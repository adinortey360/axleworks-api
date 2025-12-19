import { Router } from 'express';
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';
import { Employee, User, WorkOrder } from '../../models';
import { NotFoundError, BadRequestError, ConflictError } from '../../utils/errors';
import { parsePagination, buildPaginationInfo } from '../../utils/helpers';
import { isManager, isAdmin } from '../../middleware/rbac';
import { generateNumber } from '../../utils/helpers';

const router = Router();

// Get all employees
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search, role, status } = req.query;

    const { page: pageNum, limit: limitNum, skip } = parsePagination(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined
    );

    const filter: Record<string, unknown> = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeNumber: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;
    if (status) filter.status = status;

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .sort({ firstName: 1, lastName: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Employee.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: employees,
      pagination: buildPaginationInfo(total, pageNum, limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// Get technicians only (for dropdown selections)
router.get('/technicians', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const technicians = await Employee.find({
      role: 'technician',
      status: 'active',
    })
      .select('firstName lastName employeeNumber specializations')
      .sort({ firstName: 1 })
      .lean();

    res.json({
      success: true,
      data: technicians,
    });
  } catch (error) {
    next(error);
  }
});

// Get single employee
router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('userId', 'email lastLogin isActive')
      .lean();

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    res.json({
      success: true,
      data: employee,
    });
  } catch (error) {
    next(error);
  }
});

// Create employee
router.post('/', isAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { email, password, ...employeeData } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError('User with this email already exists');
    }

    // Determine user role based on employee role
    const userRoleMap: Record<string, string> = {
      technician: 'technician',
      service_advisor: 'technician',
      manager: 'manager',
      admin: 'admin',
      receptionist: 'technician',
    };

    // Create user account
    const user = new User({
      email,
      password: password || 'changeme123', // Default password
      firstName: employeeData.firstName,
      lastName: employeeData.lastName,
      phone: employeeData.phone,
      role: userRoleMap[employeeData.role] || 'technician',
    });
    await user.save();

    // Create employee
    const employee = new Employee({
      ...employeeData,
      userId: user._id,
      employeeNumber: generateNumber('EMP'),
    });
    await employee.save();

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update employee
router.put('/:id', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Update employee status
router.patch('/:id/status', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status, terminationDate } = req.body;

    const updateData: Record<string, unknown> = { status };
    if (status === 'terminated' && terminationDate) {
      updateData.terminationDate = terminationDate;
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    // Update associated user account
    if (status === 'terminated' || status === 'inactive') {
      await User.findByIdAndUpdate(employee.userId, { isActive: false });
    } else if (status === 'active') {
      await User.findByIdAndUpdate(employee.userId, { isActive: true });
    }

    res.json({
      success: true,
      message: 'Employee status updated',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Add certification
router.post('/:id/certifications', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    if (!employee.certifications) {
      employee.certifications = [];
    }
    employee.certifications.push(req.body);
    await employee.save();

    res.json({
      success: true,
      message: 'Certification added',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Remove certification
router.delete('/:id/certifications/:certId', isManager, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    employee.certifications = (employee.certifications || []).filter(
      c => c._id?.toString() !== req.params.certId
    );
    await employee.save();

    res.json({
      success: true,
      message: 'Certification removed',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

// Get employee work orders
router.get('/:id/workorders', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;

    const filter: Record<string, unknown> = { assignedTechnicianId: req.params.id };
    if (status) {
      filter.status = status;
    }

    const workOrders = await WorkOrder.find(filter)
      .populate('customerId', 'firstName lastName')
      .populate('vehicleId', 'make model year licensePlate')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      data: workOrders,
    });
  } catch (error) {
    next(error);
  }
});

// Delete employee (soft delete - change status to terminated)
router.delete('/:id', isAdmin, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // Check for active work orders
    const activeWorkOrders = await WorkOrder.countDocuments({
      assignedTechnicianId: req.params.id,
      status: { $nin: ['completed', 'cancelled'] },
    });

    if (activeWorkOrders > 0) {
      throw new BadRequestError('Cannot delete employee with active work orders');
    }

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { status: 'terminated', terminationDate: new Date() },
      { new: true }
    );

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    // Deactivate user account
    await User.findByIdAndUpdate(employee.userId, { isActive: false });

    res.json({
      success: true,
      message: 'Employee terminated',
      data: employee.toJSON(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
