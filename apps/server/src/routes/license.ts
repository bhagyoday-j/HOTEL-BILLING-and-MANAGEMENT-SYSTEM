import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { LicenseService } from '../services/licenseService';
import { requireAuth } from '../middleware/auth';

export const licenseRouter = Router();
const licenseService = new LicenseService();

licenseRouter.use(requireAuth);

const keySchema = z.object({
  key: z.string().trim().min(1, 'Enter your activation key').max(80),
});

/** Current machine code, subscription state and expiry. */
licenseRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(ok(await licenseService.status()));
  }),
);

licenseRouter.post(
  '/activate',
  asyncHandler(async (req, res) => {
    const body = keySchema.parse(req.body);
    res.json(ok(await licenseService.activate(body.key, req.auth!.userId)));
  }),
);

licenseRouter.post(
  '/renew',
  asyncHandler(async (req, res) => {
    const body = keySchema.parse(req.body);
    res.json(ok(await licenseService.renew(body.key, req.auth!.userId)));
  }),
);
