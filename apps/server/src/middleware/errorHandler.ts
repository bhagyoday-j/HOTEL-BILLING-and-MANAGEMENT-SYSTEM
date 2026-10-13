import type { NextFunction, Request, Response } from 'express';
import { fail } from '@hotel-billing/shared';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(fail(err.code, err.message, err.details));
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json(fail('INTERNAL_ERROR', 'An unexpected error occurred'));
}
