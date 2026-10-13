import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { SearchService } from '../services/searchService';
import { requireAuth } from '../middleware/auth';

export const searchRouter = Router();
const searchService = new SearchService();

searchRouter.use(requireAuth);

searchRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const term = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(ok(await searchService.search(term)));
  }),
);
