import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { DashboardService } from '../services/dashboardService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const dashboardRouter = Router();
const dashboardService = new DashboardService();

dashboardRouter.use(requireAuth);

/**
 * Role-aware summary: either permission passes, and the service tailors the
 * payload (managers never receive business-wide financials).
 */
dashboardRouter.get(
  '/summary',
  requirePermission('BILL_VIEW', 'ANALYTICS_VIEW'),
  asyncHandler(async (req, res) => {
    const permissions = (req as unknown as { permissions?: string[] }).permissions ?? [];
    res.json(
      ok(await dashboardService.getSummary({ isAdmin: permissions.includes('ANALYTICS_VIEW') })),
    );
  }),
);
