import { Types } from 'mongoose';
import { PaginationQuery, PaginationInfo } from '../types';
import { config } from '../config';

/**
 * Generate a unique number with prefix
 */
export const generateNumber = (prefix: string): string => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${year}-${random}${timestamp}`;
};

/**
 * Parse pagination query parameters
 * Overloaded function that can take a PaginationQuery object or separate page/limit params
 */
export function parsePagination(query: PaginationQuery): { page: number; skip: number; limit: number; sort: Record<string, 1 | -1> };
export function parsePagination(page?: number, limit?: number): { page: number; skip: number; limit: number };
export function parsePagination(queryOrPage?: PaginationQuery | number, limitParam?: number): { page: number; skip: number; limit: number; sort?: Record<string, 1 | -1> } {
  let page: number;
  let limit: number;
  let sort: Record<string, 1 | -1> | undefined;

  if (typeof queryOrPage === 'object') {
    // Called with PaginationQuery object
    const query = queryOrPage;
    page = Math.max(1, query.page || 1);
    limit = Math.min(config.pagination.maxLimit, Math.max(1, query.limit || config.pagination.defaultLimit));
    sort = {};
    if (query.sort) {
      sort[query.sort] = query.order === 'asc' ? 1 : -1;
    } else {
      sort.createdAt = -1;
    }
  } else {
    // Called with separate page/limit params
    page = Math.max(1, queryOrPage || 1);
    limit = Math.min(config.pagination.maxLimit, Math.max(1, limitParam || config.pagination.defaultLimit));
  }

  const skip = (page - 1) * limit;

  return sort !== undefined ? { page, skip, limit, sort } : { page, skip, limit };
}

/**
 * Build pagination info response
 */
export const buildPaginationInfo = (total: number, page: number, limit: number): PaginationInfo => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

/**
 * Validate MongoDB ObjectId
 */
export const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

/**
 * Convert string to ObjectId
 */
export const toObjectId = (id: string): Types.ObjectId => {
  return new Types.ObjectId(id);
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
};

/**
 * Calculate tax amount
 */
export const calculateTax = (amount: number, taxRate: number): number => {
  return Math.round(amount * (taxRate / 100) * 100) / 100;
};

/**
 * Format currency
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * Sanitize search query for regex
 */
export const sanitizeSearchQuery = (query: string): string => {
  return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Build search filter for MongoDB
 */
export const buildSearchFilter = (searchTerm: string, fields: string[]): Record<string, any> => {
  if (!searchTerm) return {};

  const sanitized = sanitizeSearchQuery(searchTerm);
  const regex = new RegExp(sanitized, 'i');

  return {
    $or: fields.map((field) => ({ [field]: regex })),
  };
};

/**
 * Parse date range filter
 */
export const parseDateRange = (startDate?: string, endDate?: string): Record<string, any> | null => {
  if (!startDate && !endDate) return null;

  const filter: Record<string, any> = {};

  if (startDate) {
    filter.$gte = new Date(startDate);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filter.$lte = end;
  }

  return filter;
};

/**
 * Get start and end of day
 */
export const getDayBounds = (date: Date = new Date()): { start: Date; end: Date } => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

/**
 * Get start and end of week
 */
export const getWeekBounds = (date: Date = new Date()): { start: Date; end: Date } => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

/**
 * Get start and end of month
 */
export const getMonthBounds = (date: Date = new Date()): { start: Date; end: Date } => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

  return { start, end };
};

/**
 * Omit fields from object
 */
export const omit = <T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

/**
 * Pick fields from object
 */
export const pick = <T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  keys.forEach((key) => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
};
