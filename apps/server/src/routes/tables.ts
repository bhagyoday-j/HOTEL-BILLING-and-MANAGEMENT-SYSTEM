import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { TableService } from '../services/tableService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const tablesRouter = Router();
const tableService = new TableService();

tablesRouter.use(requireAuth);

const tableSchema = z.object({
  number: z.string().trim().min(1, 'Table number is required').max(20),
  capacity: z.coerce.number().int('Capacity must be a whole number').min(1).max(100).optional(),
  floor: z.coerce.number().int('Floor must be a whole number').min(0).max(100).optional(),
});

const updateTableSchema = tableSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const bulkTableSchema = z.object({
  count: z.coerce
    .number()
    .int('Number of tables must be a whole number')
    .min(1, 'Create at least one table')
    .max(200, 'Create at most 200 tables at once'),
  capacity: z.coerce.number().int().min(1).max(100).optional(),
  floor: z.coerce.number().int().min(0).max(100).optional(),
});

const addItemsSchema = z.object({
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.string().min(1),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1, 'Add at least one item'),
});

const checkoutSchema = z.object({
  clientRequestId: z.string().min(8).max(64).optional(),
  customerName: z.string().trim().max(120).optional().or(z.literal('')),
  customerMobile: z.string().trim().max(20).optional().or(z.literal('')),
  notes: z.string().max(500).optional().or(z.literal('')),
});

tablesRouter.get(
  '/',
  requirePermission('MENU_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await tableService.list({
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          status: typeof req.query.status === 'string' ? req.query.status : undefined,
        }),
      ),
    );
  }),
);

tablesRouter.post(
  '/',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = tableSchema.parse(req.body);
    res.status(201).json(ok(await tableService.create(body, req.auth!.userId)));
  }),
);

/** Create T1…Tn in one step; existing tables are skipped. */
tablesRouter.post(
  '/bulk',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = bulkTableSchema.parse(req.body);
    res.status(201).json(ok(await tableService.createMany(body, req.auth!.userId)));
  }),
);

tablesRouter.get(
  '/:id',
  requirePermission('BILL_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(ok(await tableService.get(req.params.id)));
  }),
);

tablesRouter.put(
  '/:id',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = updateTableSchema.parse(req.body);
    res.json(ok(await tableService.update(req.params.id, body, req.auth!.userId)));
  }),
);

tablesRouter.delete(
  '/:id',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    res.json(ok(await tableService.remove(req.params.id, req.auth!.userId)));
  }),
);

/** Add food items to this table's running bill (creates it on first order). */
tablesRouter.post(
  '/:id/items',
  requirePermission('BILL_CREATE'),
  asyncHandler(async (req, res) => {
    const body = addItemsSchema.parse(req.body);
    res.status(201).json(ok(await tableService.addItems(req.params.id, body, req.auth!.userId)));
  }),
);

tablesRouter.delete(
  '/:id/items/:itemId',
  requirePermission('BILL_CREATE'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(await tableService.removeOrderItem(req.params.id, req.params.itemId, req.auth!.userId)),
    );
  }),
);

/** Void the unbilled running order and free the table. */
tablesRouter.post(
  '/:id/cancel',
  requirePermission('BILL_CREATE'),
  asyncHandler(async (req, res) => {
    res.json(ok(await tableService.cancelOpenOrder(req.params.id, req.auth!.userId)));
  }),
);

/** Settle the table: create its own invoice, then free the table. */
tablesRouter.post(
  '/:id/checkout',
  requirePermission('BILL_CREATE'),
  asyncHandler(async (req, res) => {
    const body = checkoutSchema.parse(req.body);
    res.status(201).json(ok(await tableService.checkout(req.params.id, body, req.auth!.userId)));
  }),
);
