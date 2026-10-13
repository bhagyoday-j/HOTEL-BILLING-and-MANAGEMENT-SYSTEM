import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { AuditQueryService } from '../services/auditQueryService';
import { requireAuth, requirePermission } from '../middleware/auth';

export const auditRouter = Router();
const auditQueryService = new AuditQueryService();

auditRouter.use(requireAuth);

auditRouter.get(
  '/',
  requirePermission('AUDIT_LOG_VIEW'),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await auditQueryService.list({
          action: typeof req.query.action === 'string' ? req.query.action : undefined,
          userId: typeof req.query.userId === 'string' ? req.query.userId : undefined,
          entityType: typeof req.query.entityType === 'string' ? req.query.entityType : undefined,
          from: typeof req.query.from === 'string' ? req.query.from : undefined,
          to: typeof req.query.to === 'string' ? req.query.to : undefined,
          page: Number(req.query.page ?? 1),
        }),
      ),
    );
  }),
);
