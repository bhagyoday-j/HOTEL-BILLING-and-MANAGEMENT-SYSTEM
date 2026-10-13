import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { InvoiceService } from '../services/invoiceService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const invoicesRouter = Router();
const invoiceService = new InvoiceService();

invoicesRouter.use(requireAuth);

const createSchema = z.object({
  guestId: z.string().optional(),
  guestName: z.string().optional(),
  guestMobile: z.string().optional(),
  roomId: z.string().optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(1, 'Description is required'),
        quantity: z.string().min(1),
        unitPrice: z.string().min(1),
        discountAmount: z.string().optional(),
        taxRate: z.string().optional(),
      }),
    )
    .min(1, 'Add at least one line item'),
  orderDiscountAmount: z.string().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
        amount: z.string(),
        reference: z.string().optional(),
      }),
    )
    .optional(),
  notes: z.string().optional(),
});

invoicesRouter.get(
  '/',
  requirePermission('INVOICE_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await invoiceService.list({
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

invoicesRouter.get(
  '/:id',
  requirePermission('INVOICE_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await invoiceService.get(req.params.id)));
  }),
);

invoicesRouter.post(
  '/',
  requirePermission('INVOICE_CREATE'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    res.status(201).json(ok(await invoiceService.create(body, req.auth!.userId)));
  }),
);

invoicesRouter.post(
  '/:id/payments',
  requirePermission('PAYMENT_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
        amount: z.string(),
        reference: z.string().optional(),
      })
      .parse(req.body);
    res
      .status(201)
      .json(ok(await invoiceService.addPayment(req.params.id, body, req.auth!.userId)));
  }),
);

invoicesRouter.post(
  '/:id/cancel',
  requirePermission('INVOICE_CANCEL'),
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().min(1, 'Reason is required') }).parse(req.body);
    await invoiceService.cancel(req.params.id, body.reason, req.auth!.userId);
    res.json(ok({ cancelled: true }));
  }),
);
