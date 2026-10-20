import type { NextFunction, Request, Response } from 'express';
import { LicenseService } from '../services/licenseService';

/**
 * API routes that must stay reachable without an active subscription:
 * health (Electron readiness probe), first-run setup, sign-in/password change
 * and the activation endpoints themselves. Everything else — menu, tables,
 * bills, customers, analytics, accounts, settings, backups — requires a valid
 * subscription, enforced here rather than in the UI.
 */
const EXEMPT_PREFIXES = ['/health', '/setup', '/auth', '/license'];

const licenseService = new LicenseService();

export function licenseGate(req: Request, _res: Response, next: NextFunction): void {
  // Mounted on /api, so req.path is relative ('/dashboard/summary').
  const path = req.path;
  if (EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    next();
    return;
  }

  void licenseService.assertActive().then(
    () => next(),
    (err) => next(err),
  );
}
