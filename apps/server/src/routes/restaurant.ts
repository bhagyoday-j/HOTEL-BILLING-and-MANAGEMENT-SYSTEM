import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { RestaurantService } from '../services/restaurantService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const restaurantRouter = Router();
const restaurantService = new RestaurantService();

restaurantRouter.use(requireAuth);

const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.string().min(1),
  notes: z.string().optional(),
  discountAmount: z.string().optional(),
});

const createOrderSchema = z.object({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE']),
  tableId: z.string().optional(),
  roomId: z.string().optional(),
  bookingId: z.string().optional(),
  guestName: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'Add at least one item'),
  orderDiscountAmount: z.string().optional(),
  notes: z.string().optional(),
});

// ─── Menu ─────────────────────────────────────────────────────
restaurantRouter.get(
  '/menu',
  requirePermission('RESTAURANT_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await restaurantService.listCategories()));
  }),
);

restaurantRouter.post(
  '/menu/categories',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    res.status(201).json(ok(await restaurantService.createCategory(body.name, req.auth!.userId)));
  }),
);

restaurantRouter.post(
  '/menu/items',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1, 'Name is required'),
        sku: z.string().optional(),
        categoryId: z.string().min(1, 'Category is required'),
        price: z.string().min(1, 'Price is required'),
        taxRate: z.string().optional(),
        description: z.string().optional(),
        kitchenName: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(ok(await restaurantService.createMenuItem(body, req.auth!.userId)));
  }),
);

restaurantRouter.put(
  '/menu/items/:id',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        sku: z.string().optional(),
        price: z.string().optional(),
        taxRate: z.string().optional(),
        description: z.string().optional(),
        kitchenName: z.string().optional(),
        isAvailable: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    res.json(ok(await restaurantService.updateMenuItem(req.params.id, body, req.auth!.userId)));
  }),
);

// ─── Tables ───────────────────────────────────────────────────
restaurantRouter.get(
  '/tables',
  requirePermission('RESTAURANT_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await restaurantService.listTables()));
  }),
);

restaurantRouter.post(
  '/tables',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({ name: z.string().min(1), capacity: z.coerce.number().int().min(1).max(30) })
      .parse(req.body);
    res.status(201).json(ok(await restaurantService.createTable(body.name, body.capacity, req.auth!.userId)));
  }),
);

// ─── Orders ───────────────────────────────────────────────────
restaurantRouter.get(
  '/orders',
  requirePermission('RESTAURANT_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await restaurantService.listOrders({
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
          tableId: typeof req.query.tableId === 'string' ? req.query.tableId : undefined,
          page: Number(req.query.page ?? 1),
          pageSize: Number(req.query.pageSize ?? 25),
        }),
      ),
    );
  }),
);

restaurantRouter.get(
  '/orders/:id',
  requirePermission('RESTAURANT_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await restaurantService.getOrder(req.params.id)));
  }),
);

restaurantRouter.post(
  '/orders',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = createOrderSchema.parse(req.body);
    res.status(201).json(ok(await restaurantService.createOrder(body, req.auth!.userId)));
  }),
);

restaurantRouter.post(
  '/orders/:id/items',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ items: z.array(orderItemSchema).min(1) }).parse(req.body);
    res.json(ok(await restaurantService.addItems(req.params.id, body.items, req.auth!.userId)));
  }),
);

restaurantRouter.post(
  '/orders/:id/cancel',
  requirePermission('RESTAURANT_ORDER_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ reason: z.string().min(1) }).parse(req.body);
    await restaurantService.cancelOrder(req.params.id, body.reason, req.auth!.userId);
    res.json(ok({ cancelled: true }));
  }),
);

restaurantRouter.post(
  '/orders/:id/pay',
  requirePermission('PAYMENT_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        payments: z
          .array(
            z.object({
              method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
              amount: z.string(),
              reference: z.string().optional(),
            }),
          )
          .min(1, 'At least one payment is required'),
        orderDiscountAmount: z.string().optional(),
      })
      .parse(req.body);
    res.json(ok(await restaurantService.payOrder(req.params.id, req.auth!.userId, body)));
  }),
);
