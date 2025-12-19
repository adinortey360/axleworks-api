import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/**
 * Role-based access control middleware
 * Checks if the authenticated user has one of the required roles
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to access this resource'));
    }

    next();
  };
};

/**
 * Check if user is admin
 */
export const isAdmin = authorize('admin');

/**
 * Check if user is admin or manager
 */
export const isManager = authorize('admin', 'manager');

/**
 * Check if user is staff (admin, manager, or technician)
 */
export const isStaff = authorize('admin', 'manager', 'technician');

/**
 * Check if user is customer
 */
export const isCustomer = authorize('customer');

/**
 * Check if user can access customer data
 * Admin/Manager can access all, customers can only access their own
 */
export const canAccessCustomerData = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  // Admin and manager can access all customer data
  if (['admin', 'manager'].includes(req.user.role)) {
    return next();
  }

  // Customers can only access their own data
  if (req.user.role === 'customer') {
    const customerId = req.params.customerId || req.params.id;

    // If accessing customer data, check if it's their own
    if (customerId && req.user.customerId !== customerId) {
      return next(new ForbiddenError('You can only access your own data'));
    }
  }

  next();
};

/**
 * Check resource ownership
 * Used for routes where users can only access their own resources
 */
export const checkOwnership = (getOwnerId: (req: AuthRequest) => string | undefined) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // Admin and manager can access all
    if (['admin', 'manager'].includes(req.user.role)) {
      return next();
    }

    const ownerId = getOwnerId(req);
    const userId = req.user.customerId || req.user.userId;

    if (ownerId && ownerId !== userId) {
      return next(new ForbiddenError('You do not have permission to access this resource'));
    }

    next();
  };
};

/**
 * Role hierarchy for permission checks
 */
export const roleHierarchy: Record<UserRole, number> = {
  customer: 0,
  technician: 1,
  manager: 2,
  admin: 3,
};

/**
 * Check if user has minimum role level
 */
export const hasMinRole = (minRole: UserRole) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userLevel = roleHierarchy[req.user.role];
    const requiredLevel = roleHierarchy[minRole];

    if (userLevel < requiredLevel) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};
