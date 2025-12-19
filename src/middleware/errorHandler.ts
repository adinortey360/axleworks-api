import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, ValidationError } from '../utils/errors';
import { config } from '../config';

interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  errors?: Record<string, string>;
  stack?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: Record<string, string> | undefined;

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;

    if (err instanceof ValidationError) {
      errors = err.errors;
    }
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 422;
    message = 'Validation Error';
    errors = {};
    err.errors.forEach((e) => {
      const path = e.path.join('.');
      errors![path] = e.message;
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation Error';
    errors = {};
    const mongooseError = err as any;
    Object.keys(mongooseError.errors).forEach((key) => {
      errors![key] = mongooseError.errors[key].message;
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
  }

  // Handle Mongoose duplicate key error
  if ((err as any).code === 11000) {
    statusCode = 409;
    const field = Object.keys((err as any).keyValue)[0];
    message = `${field} already exists`;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Build response
  const response: ErrorResponse = {
    success: false,
    error: err.name,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  // Include stack trace in development
  if (config.nodeEnv === 'development') {
    response.stack = err.stack;
  }

  // Log error
  console.error(`[${new Date().toISOString()}] Error:`, {
    statusCode,
    message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Route ${req.method} ${req.path} not found`,
  });
};
