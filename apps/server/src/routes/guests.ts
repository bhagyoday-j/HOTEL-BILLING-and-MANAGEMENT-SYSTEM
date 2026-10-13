import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { GuestService } from '../services/guestService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const guestsRouter = Router();
const guestService = new GuestService();

guestsRouter.use(requireAuth);

const guestSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  mobile: z
    .string()
    .regex(/^(\+\d{1,3}[\s-]?)?\d{10}$/, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  nationality: z.string().optional(),
  notes: z.string().optional(),
});

guestsRouter.get(
  '/',
  requirePermission('GUEST_VIEW'),
  asyncHandler(async (req, res) => {
    const result = await guestService.list({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: Number(req.query.page ?? 1),
      pageSize: Number(req.query.pageSize ?? 25),
    });
    res.json(ok(result));
  }),
);

guestsRouter.get(
  '/search',
  requirePermission('GUEST_VIEW'),
  asyncHandler(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(ok(await guestService.searchLite(term)));
  }),
);

guestsRouter.get(
  '/:id',
  requirePermission('GUEST_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await guestService.get(req.params.id)));
  }),
);

guestsRouter.post(
  '/',
  requirePermission('GUEST_CREATE'),
  asyncHandler(async (req, res) => {
    const body = guestSchema.parse(req.body);
    res.status(201).json(ok(await guestService.create(body, req.auth!.userId)));
  }),
);

guestsRouter.put(
  '/:id',
  requirePermission('GUEST_UPDATE'),
  asyncHandler(async (req, res) => {
    const body = guestSchema.partial().parse(req.body);
    res.json(ok(await guestService.update(req.params.id, body, req.auth!.userId)));
  }),
);

guestsRouter.delete(
  '/:id',
  requirePermission('GUEST_UPDATE', 'USER_MANAGE'),
  asyncHandler(async (req, res) => {
    await guestService.remove(req.params.id, req.auth!.userId);
    res.json(ok({ archived: true }));
  }),
);
