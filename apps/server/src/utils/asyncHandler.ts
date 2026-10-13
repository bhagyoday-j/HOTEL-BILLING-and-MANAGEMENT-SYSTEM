import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from './errors';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export default function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch((err: unknown) => {
      if (err instanceof ZodError) {
        next(
          new AppError('VALIDATION_ERROR', 'Invalid request data', 400, err.flatten()),
        );
        return;
      }
      next(err);
    });
  };
}
