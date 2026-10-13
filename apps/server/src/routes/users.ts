import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import {
  UserService,
  createManagerSchema,
  updateManagerSchema,
} from '../services/userService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const usersRouter = Router();
const userService = new UserService();

usersRouter.use(requireAuth);

/** List registered manager accounts. */
usersRouter.get(
  '/',
  requirePermission('MANAGER_MANAGE'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await userService.list()));
  }),
);

/** Create a manager account (role is always MANAGER — never accepted from input). */
usersRouter.post(
  '/',
  requirePermission('MANAGER_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = createManagerSchema.parse(req.body);
    res.status(201).json(ok(await userService.create(body, req.auth!.userId)));
  }),
);

/** Update manager details, reset password, activate/deactivate. */
usersRouter.put(
  '/:id',
  requirePermission('MANAGER_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = updateManagerSchema.parse(req.body);
    await userService.update(req.params.id, body, req.auth!.userId);
    res.json(ok({ updated: true }));
  }),
);

/** Soft-delete a manager account. */
usersRouter.delete(
  '/:id',
  requirePermission('MANAGER_MANAGE'),
  asyncHandler(async (req, res) => {
    await userService.remove(req.params.id, req.auth!.userId);
    res.json(ok({ archived: true }));
  }),
);
