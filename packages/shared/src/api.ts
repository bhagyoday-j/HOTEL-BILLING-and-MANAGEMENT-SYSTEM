import { z } from 'zod';

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

export function fail(code: string, message: string, details?: unknown): {
  success: false;
  error: { code: string; message: string; details?: unknown };
} {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}
