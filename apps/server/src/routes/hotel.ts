import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { HotelService } from '../services/hotelService';
import { requireAuth } from '../middleware/auth';

export const hotelRouter = Router();
const hotelService = new HotelService();

hotelRouter.use(requireAuth);

hotelRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const hotel = await hotelService.getHotel();
    res.json(ok(hotel));
  }),
);

hotelRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const settings = await hotelService.getSettings();
    res.json(ok(settings));
  }),
);
