import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import { AuthService } from '../services/authService';
import { requireAuth } from '../middleware/auth';
import asyncHandler from '../utils/asyncHandler';
import { z } from 'zod';

export const authRouter = Router();
const authService = new AuthService();

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.username, body.password);
    res.json(ok(result));
  }),
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(200),
});

/**
 * Any signed-in user can change their own password. ADMIN accounts cannot be updated
 * through /api/users (that endpoint is manager-only), so this is the only way the
 * owner can rotate their credentials.
 */
authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    await authService.changePassword(
      req.auth!.userId,
      req.auth!.token,
      body.currentPassword,
      body.newPassword,
    );
    res.json(ok({ changed: true }));
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId : undefined;
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    await authService.logout(userId, token);
    res.json(ok({ loggedOut: true }));
  }),
);
