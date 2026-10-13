import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import { AuthService } from '../services/authService';
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
