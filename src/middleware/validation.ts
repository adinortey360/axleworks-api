import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

type RequestLocation = 'body' | 'query' | 'params';

/**
 * Validate request data against a Zod schema
 */
export const validate = (schema: ZodSchema, location: RequestLocation = 'body') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = req[location];
      const validated = await schema.parseAsync(data);

      // Replace request data with validated/transformed data
      req[location] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((e) => {
          const path = e.path.join('.');
          errors[path] = e.message;
        });
        next(new ValidationError('Validation failed', errors));
      } else {
        next(error);
      }
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');

/**
 * Validate request query params
 */
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');

/**
 * Validate request URL params
 */
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');

/**
 * Validate multiple locations
 */
export const validateRequest = (schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors: Record<string, string> = {};

      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              errors[`body.${e.path.join('.')}`] = e.message;
            });
          }
        }
      }

      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              errors[`query.${e.path.join('.')}`] = e.message;
            });
          }
        }
      }

      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((e) => {
              errors[`params.${e.path.join('.')}`] = e.message;
            });
          }
        }
      }

      if (Object.keys(errors).length > 0) {
        throw new ValidationError('Validation failed', errors);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
