import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors';
import { sessionStore } from '../services/sessionStore';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      token: string;
      userId: string;
      username: string;
    };
  }
}

function extractToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return undefined;
  return token;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  sessionStore.sweep();
  const token = extractToken(req.headers.authorization);
  const session = sessionStore.get(token);
  if (!session) {
    next(new AppError('UNAUTHENTICATED', 'Please sign in to continue', 401));
    return;
  }
  req.auth = { token: session.token, userId: session.userId, username: session.username };
  next();
}

/**
 * Server-side RBAC. The frontend hiding buttons is a convenience only —
 * every protected route must enforce permissions here.
 */
export function requirePermission(...codes: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const session = sessionStore.get(extractToken(req.headers.authorization));
    if (!session) {
      next(new AppError('UNAUTHENTICATED', 'Please sign in to continue', 401));
      return;
    }
    void (async () => {
      try {
        const { getPrisma } = await import('../utils/prisma');
        const user = await getPrisma().user.findFirst({
          where: { id: session.userId, deletedAt: null, isActive: true },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        });
        if (!user) {
          next(new AppError('UNAUTHENTICATED', 'Account is disabled', 401));
          return;
        }
        const granted = user.role.permissions.map((rp) => rp.permission.code);
        const allowed = codes.length === 0 || codes.some((c) => granted.includes(c));
        if (!allowed) {
          next(
            new AppError(
              'PERMISSION_DENIED',
              `You do not have permission for this action (${codes.join(', ')})`,
              403,
            ),
          );
          return;
        }
        req.auth = { token: session.token, userId: session.userId, username: session.username };
        (req as Request & { permissions?: string[] }).permissions = granted;
        next();
      } catch (err) {
        next(err);
      }
    })();
  };
}
