import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { CashSessionService } from '../services/cashSessionService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const cashSessionsRouter = Router();
const cashSessionService = new CashSessionService();

cashSessionsRouter.use(requireAuth);

cashSessionsRouter.get(
  '/current',
  asyncHandler(async (req, res) => {
    res.json(ok(await cashSessionService.current(req.auth!.userId)));
  }),
);

cashSessionsRouter.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    res.json(ok(await cashSessionService.summary(req.params.id)));
  }),
);

cashSessionsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ openingCash: z.string().min(1), notes: z.string().optional() })
      .parse(req.body);
    res.status(201).json(ok(await cashSessionService.open(req.auth!.userId, body.openingCash, body.notes)));
  }),
);

cashSessionsRouter.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const body = z
      .object({ actualCash: z.string().min(1), notes: z.string().optional() })
      .parse(req.body);
    res.json(ok(await cashSessionService.close(req.params.id, req.auth!.userId, body)));
  }),
);

cashSessionsRouter.get(
  '/',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await cashSessionService.list({
          page: Number(req.query.page ?? 1),
          userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
        }),
      ),
    );
  }),
);
