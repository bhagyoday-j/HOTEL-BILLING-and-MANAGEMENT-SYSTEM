import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { HotelAdminService } from '../services/hotelAdminService';
import { SettingsService } from '../services/settingsService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const settingsRouter = Router();
const hotelAdminService = new HotelAdminService();
const settingsService = new SettingsService();

settingsRouter.use(requireAuth);

const profileSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().optional(),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format')
    .optional()
    .or(z.literal('')),
  pan: z
    .string()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format')
    .optional()
    .or(z.literal('')),
});

settingsRouter.get(
  '/hotel',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await hotelAdminService.getProfile()));
  }),
);

settingsRouter.put(
  '/hotel',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = profileSchema.parse(req.body);
    res.json(ok(await hotelAdminService.updateProfile(body, req.auth!.userId)));
  }),
);

settingsRouter.get(
  '/',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await settingsService.all()));
  }),
);

settingsRouter.put(
  '/',
  requirePermission('SETTINGS_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = z.record(z.string()).parse(req.body);
    res.json(ok(await hotelAdminService.updateSettings(body, req.auth!.userId)));
  }),
);
