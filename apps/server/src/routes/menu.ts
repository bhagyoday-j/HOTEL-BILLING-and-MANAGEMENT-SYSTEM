import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { MenuService } from '../services/menuService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const menuRouter = Router();
const menuService = new MenuService();

menuRouter.use(requireAuth);

const createItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required').max(120),
  sku: z.string().trim().max(40).optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Category is required'),
  price: z.string().min(1, 'Price is required'),
  taxRate: z.string().optional(),
  description: z.string().max(500).optional().or(z.literal('')),
  isAvailable: z.boolean().optional(),
});

const updateItemSchema = createItemSchema.partial();

menuRouter.get(
  '/',
  requirePermission('MENU_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await menuService.list({
          search: typeof req.query.search === 'string' ? req.query.search : undefined,
          categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
          availableOnly: req.query.available === 'true',
        }),
      ),
    );
  }),
);

menuRouter.post(
  '/categories',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().trim().min(1).max(60) }).parse(req.body);
    res.status(201).json(ok(await menuService.createCategory(body.name, req.auth!.userId)));
  }),
);

menuRouter.post(
  '/items',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = createItemSchema.parse(req.body);
    res.status(201).json(ok(await menuService.createItem(body, req.auth!.userId)));
  }),
);

menuRouter.put(
  '/items/:id',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    const body = updateItemSchema.parse(req.body);
    res.json(ok(await menuService.updateItem(req.params.id, body, req.auth!.userId)));
  }),
);

menuRouter.delete(
  '/items/:id',
  requirePermission('MENU_MANAGE'),
  asyncHandler(async (req, res) => {
    res.json(ok(await menuService.deleteItem(req.params.id, req.auth!.userId)));
  }),
);
