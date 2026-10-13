import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { UserService, createUserSchema, updateUserSchema } from '../services/userService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const usersRouter = Router();
const userService = new UserService();

usersRouter.use(requireAuth);

usersRouter.get(
  '/',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await userService.list()));
  }),
);

usersRouter.get(
  '/roles',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await userService.listRoles()));
  }),
);

usersRouter.post(
  '/',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = createUserSchema.parse(req.body);
    res.status(201).json(ok(await userService.create(body, req.auth!.userId)));
  }),
);

usersRouter.put(
  '/:id',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = updateUserSchema.parse(req.body);
    await userService.update(req.params.id, body, req.auth!.userId);
    res.json(ok({ updated: true }));
  }),
);

usersRouter.delete(
  '/:id',
  requirePermission('USER_MANAGE'),
  asyncHandler(async (req, res) => {
    await userService.remove(req.params.id, req.auth!.userId);
    res.json(ok({ archived: true }));
  }),
);
