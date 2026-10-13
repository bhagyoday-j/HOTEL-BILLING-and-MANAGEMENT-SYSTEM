import type { NextFunction, Request, Response } from 'express';
import { fail } from '@hotel-billing/shared';
import { ZodError } from 'zod';
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

  if (err instanceof ZodError) {
    const first = err.issues[0];
    const message = first
      ? `${first.path.join('.') || 'input'}: ${first.message}`
      : 'Invalid request payload';
    res.status(400).json(fail('VALIDATION_ERROR', message, err.issues));
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json(fail('INTERNAL_ERROR', 'An unexpected error occurred'));
}
