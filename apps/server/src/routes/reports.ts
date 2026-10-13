import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { ReportService } from '../services/reportService';
import { requireAuth, requirePermission } from '../middleware/auth';
import { resolveDateRange } from '../utils/dates';

export const reportsRouter = Router();
const reportService = new ReportService();

reportsRouter.use(requireAuth);

const rangeSchema = z.object({
  preset: z.enum(['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH', 'CUSTOM']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function rangeFromQuery(query: Record<string, unknown>) {
  return rangeSchema.parse({
    preset: query.preset,
    from: query.from,
    to: query.to,
  });
}

reportsRouter.get(
  '/sales-summary',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.salesSummary(from, to)));
  }),
);

reportsRouter.get(
  '/revenue-by-day',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.revenueByDay(from, to)));
  }),
);

reportsRouter.get(
  '/payments-by-method',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.paymentsByMethod(from, to)));
  }),
);

reportsRouter.get(
  '/top-menu-items',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.topMenuItems(from, to)));
  }),
);

reportsRouter.get(
  '/occupancy',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.occupancy(from, to)));
  }),
);

reportsRouter.get(
  '/outstanding-dues',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (_req, res) => {
    res.json(ok(await reportService.outstandingDues()));
  }),
);

reportsRouter.get(
  '/gst-summary',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.gstSummary(from, to)));
  }),
);

reportsRouter.get(
  '/guest-report',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.guestReport(from, to)));
  }),
);

reportsRouter.get(
  '/expense-report',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.expenseReport(from, to)));
  }),
);

reportsRouter.get(
  '/cancelled-invoices',
  requirePermission('REPORT_VIEW'),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveDateRange(rangeFromQuery(req.query));
    res.json(ok(await reportService.cancelledInvoices(from, to)));
  }),
);
