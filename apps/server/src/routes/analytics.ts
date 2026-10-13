import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { AnalyticsService } from '../services/analyticsService';
import { requireAuth, requirePermission } from '../middleware/auth';
import { resolveDateRange } from '../utils/dates';

export const analyticsRouter = Router();
const analyticsService = new AnalyticsService();

analyticsRouter.use(requireAuth);

const querySchema = z.object({
  preset: z.enum(['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(['day', 'week', 'month']).optional(),
});

/** Owner-only business analytics. */
analyticsRouter.get(
  '/summary',
  requirePermission('ANALYTICS_VIEW'),
  asyncHandler(async (req, res) => {
    const query = querySchema.parse({
      preset: req.query.preset,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy,
    });
    const { from, to } = resolveDateRange({
      preset: query.preset ?? (query.from && query.to ? 'CUSTOM' : 'THIS_MONTH'),
      from: query.from,
      to: query.to,
    });
    res.json(
      ok(await analyticsService.summary({ from, to, groupBy: query.groupBy ?? 'day' })),
    );
  }),
);
