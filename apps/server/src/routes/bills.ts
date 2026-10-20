import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { BillService } from '../services/billService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const billsRouter = Router();
const billService = new BillService();

billsRouter.use(requireAuth);

const createBillSchema = z.object({
  clientRequestId: z.string().min(8).max(64).optional(),
  customerName: z.string().trim().max(120).optional().or(z.literal('')),
  customerMobile: z.string().trim().max(20).optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.string().min(1),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1, 'Add at least one item'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

billsRouter.get(
  '/',
  requirePermission('BILL_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await billService.list({
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          from: typeof req.query.from === 'string' ? req.query.from : undefined,
          to: typeof req.query.to === 'string' ? req.query.to : undefined,
          page: Number(req.query.page ?? 1),
          pageSize: Number(req.query.pageSize ?? 25),
        }),
      ),
    );
  }),
);

billsRouter.get(
  '/:id',
  requirePermission('BILL_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await billService.get(req.params.id)));
  }),
);

billsRouter.post(
  '/',
  requirePermission('BILL_CREATE'),
  asyncHandler(async (req, res) => {
    const body = createBillSchema.parse(req.body);
    res.status(201).json(ok(await billService.create(body, req.auth!.userId)));
  }),
);

billsRouter.post(
  '/:id/cancel',
  requirePermission('BILL_CANCEL'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        reason: z.string().trim().min(1, 'Reason is required').max(200, 'Reason is too long'),
      })
      .parse(req.body);
    res.json(ok(await billService.cancel(req.params.id, body.reason, req.auth!.userId)));
  }),
);
