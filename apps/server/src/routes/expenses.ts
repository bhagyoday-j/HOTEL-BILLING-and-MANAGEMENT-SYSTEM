import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { ExpenseService } from '../services/expenseService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const expensesRouter = Router();
const expenseService = new ExpenseService();

expensesRouter.use(requireAuth);

expensesRouter.get(
  '/categories',
  requirePermission('DASHBOARD_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await expenseService.listCategories()));
  }),
);

expensesRouter.get(
  '/',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await expenseService.list({
          from: typeof req.query.from === 'string' ? req.query.from : undefined,
          to: typeof req.query.to === 'string' ? req.query.to : undefined,
          categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
          page: Number(req.query.page ?? 1),
        }),
      ),
    );
  }),
);

expensesRouter.post(
  '/',
  requirePermission('EXPENSE_CREATE'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        categoryId: z.string().min(1, 'Category is required'),
        amount: z.string().min(1, 'Amount is required'),
        description: z.string().optional(),
        paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER']).optional(),
        expenseDate: z.string().optional(),
      })
      .parse(req.body);
    res.status(201).json(ok(await expenseService.create(body, req.auth!.userId)));
  }),
);
