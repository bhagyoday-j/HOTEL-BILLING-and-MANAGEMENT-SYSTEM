import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { CustomerService } from '../services/customerService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const customersRouter = Router();
const customerService = new CustomerService();

customersRouter.use(requireAuth);

const listQuerySchema = z.object({
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const lookupQuerySchema = z.object({
  mobile: z.string().max(20).optional(),
  name: z.string().max(120).optional(),
});

/**
 * Customer directory derived from billing history. Read-only and available to
 * anyone who can view bills (owner and manager), so both roles can see how
 * many times a customer has visited.
 */
customersRouter.get(
  '/',
  requirePermission('BILL_VIEW'),
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse({
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      page: typeof req.query.page === 'string' ? req.query.page : undefined,
      pageSize: typeof req.query.pageSize === 'string' ? req.query.pageSize : undefined,
    });
    res.json(ok(await customerService.list(query)));
  }),
);

/** Returning-customer lookup used while creating a bill. */
customersRouter.get(
  '/lookup',
  requirePermission('BILL_VIEW'),
  asyncHandler(async (req, res) => {
    const query = lookupQuerySchema.parse({
      mobile: typeof req.query.mobile === 'string' ? req.query.mobile : undefined,
      name: typeof req.query.name === 'string' ? req.query.name : undefined,
    });
    res.json(ok(await customerService.lookup(query)));
  }),
);
