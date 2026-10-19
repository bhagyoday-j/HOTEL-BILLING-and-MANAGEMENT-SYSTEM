import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { SetupService, setupSchema } from '../services/setupService';

export const setupRouter = Router();
const setupService = new SetupService();

/**
 * Public: the sign-in screen asks this to decide whether to show first-run setup.
 * It only ever reports whether an owner account exists.
 */
setupRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(ok(await setupService.status()));
  }),
);

/**
 * Public, but only while the installation has no owner account. Once an owner
 * exists the service refuses (409), so this cannot be used to create a second admin.
 */
setupRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = setupSchema.parse(req.body);
    res.status(201).json(ok(await setupService.complete(body)));
  }),
);
