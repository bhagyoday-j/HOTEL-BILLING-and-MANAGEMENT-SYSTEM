import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { BookingService } from '../services/bookingService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const bookingsRouter = Router();
const bookingService = new BookingService();

bookingsRouter.use(requireAuth);

const bookingSchema = z.object({
  guestId: z.string().min(1, 'Guest is required'),
  roomId: z.string().min(1, 'Room is required'),
  checkInDate: z.string().min(1, 'Check-in date is required'),
  checkOutDate: z.string().min(1, 'Check-out date is required'),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20).optional(),
  roomRate: z.string().optional(),
  discountAmount: z.string().optional(),
  advancePayment: z.string().optional(),
  specialRequests: z.string().optional(),
});

bookingsRouter.get(
  '/',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await bookingService.list({
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          roomId: typeof req.query.roomId === 'string' ? req.query.roomId : undefined,
          guestId: typeof req.query.guestId === 'string' ? req.query.guestId : undefined,
          upcoming: req.query.upcoming === 'true',
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          page: Number(req.query.page ?? 1),
          pageSize: Number(req.query.pageSize ?? 25),
        }),
      ),
    );
  }),
);

bookingsRouter.get(
  '/:id',
  requirePermission('ROOM_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await bookingService.get(req.params.id)));
  }),
);

bookingsRouter.get(
  '/:id/folio',
  requirePermission('INVOICE_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await bookingService.folio(req.params.id)));
  }),
);

bookingsRouter.post(
  '/',
  requirePermission('BOOKING_CREATE'),
  asyncHandler(async (req, res) => {
    const body = bookingSchema.parse(req.body);
    res.status(201).json(ok(await bookingService.create(body, req.auth!.userId)));
  }),
);

bookingsRouter.put(
  '/:id',
  requirePermission('BOOKING_UPDATE'),
  asyncHandler(async (req, res) => {
    const body = bookingSchema.partial().parse(req.body);
    res.json(ok(await bookingService.update(req.params.id, body, req.auth!.userId)));
  }),
);

bookingsRouter.post(
  '/:id/cancel',
  requirePermission('BOOKING_UPDATE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().min(1, 'Reason is required') }).parse(req.body);
    await bookingService.cancel(req.params.id, body.reason, req.auth!.userId);
    res.json(ok({ cancelled: true }));
  }),
);

bookingsRouter.post(
  '/:id/check-in',
  requirePermission('BOOKING_UPDATE'),
  asyncHandler(async (req, res) => {
    res.json(ok(await bookingService.checkIn(req.params.id, req.auth!.userId)));
  }),
);

bookingsRouter.post(
  '/:id/check-out',
  requirePermission('INVOICE_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        discountAmount: z.string().optional(),
        payments: z
          .array(
            z.object({
              method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
              amount: z.string(),
              reference: z.string().optional(),
            }),
          )
          .optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    res.json(ok(await bookingService.checkOut(req.params.id, req.auth!.userId, body)));
  }),
);
