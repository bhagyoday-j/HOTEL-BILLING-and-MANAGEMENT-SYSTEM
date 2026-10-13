import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { RoomService } from '../services/roomService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const roomsRouter = Router();
const roomService = new RoomService();

roomsRouter.use(requireAuth);

const roomSchema = z.object({
  number: z.string().min(1, 'Room number is required'),
  floor: z.coerce.number().int().min(0).max(50),
  roomTypeId: z.string().min(1, 'Room type is required'),
  price: z.string().optional(),
  capacity: z.coerce.number().int().min(1).max(20).optional(),
  status: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const roomTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  basePrice: z.string().min(1),
  maxGuests: z.coerce.number().int().min(1).max(20),
  amenities: z.array(z.string()).optional(),
});

roomsRouter.get(
  '/',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await roomService.list()));
  }),
);

roomsRouter.get(
  '/grid',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await roomService.grid()));
  }),
);

roomsRouter.get(
  '/types',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await roomService.listTypes()));
  }),
);

roomsRouter.post(
  '/types',
  requirePermission('ROOM_CREATE'),
  asyncHandler(async (req, res) => {
    const body = roomTypeSchema.parse(req.body);
    res.status(201).json(ok(await roomService.createType(body, req.auth!.userId)));
  }),
);

roomsRouter.get(
  '/:id',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await roomService.get(req.params.id)));
  }),
);

roomsRouter.post(
  '/',
  requirePermission('ROOM_CREATE'),
  asyncHandler(async (req, res) => {
    const body = roomSchema.parse(req.body);
    res.status(201).json(ok(await roomService.create(body, req.auth!.userId)));
  }),
);

roomsRouter.put(
  '/:id',
  requirePermission('ROOM_UPDATE'),
  asyncHandler(async (req, res) => {
    const body = roomSchema.partial().parse(req.body);
    res.json(ok(await roomService.update(req.params.id, body, req.auth!.userId)));
  }),
);

roomsRouter.patch(
  '/:id/status',
  requirePermission('ROOM_UPDATE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.string() }).parse(req.body);
    res.json(ok(await roomService.updateStatus(req.params.id, body.status, req.auth!.userId)));
  }),
);

roomsRouter.delete(
  '/:id',
  requirePermission('ROOM_DELETE'),
  asyncHandler(async (req, res) => {
    await roomService.remove(req.params.id, req.auth!.userId);
    res.json(ok({ archived: true }));
  }),
);
