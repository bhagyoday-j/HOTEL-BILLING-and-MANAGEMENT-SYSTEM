import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { DashboardService } from '../services/dashboardService';

export const dashboardRouter = Router();
const dashboardService = new DashboardService();

dashboardRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    const summary = await dashboardService.getSummary();
    res.json(ok(summary));
  }),
);
