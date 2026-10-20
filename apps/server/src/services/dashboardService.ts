import { REVENUE_EXCLUDED_STATUSES } from '@hotel-billing/shared';
import { startOfDay, endOfDay } from '../utils/dates';
import { getPrisma } from '../utils/prisma';

const EXCLUDED_FROM_REVENUE = [...REVENUE_EXCLUDED_STATUSES];

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

export interface DashboardContext {
  isAdmin: boolean;
}

/**
 * Role-aware dashboard summary.
 * - ADMIN: business overview (revenue, bill counts, recent bills).
 * - MANAGER: only today's billing activity — no business-wide revenue.
 */
export class DashboardService {
  async getSummary(ctx: DashboardContext) {
    const prisma = getPrisma();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayBills, recentBills] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: startOfDay(now), lte: endOfDay(now) },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: { deletedAt: null },
        orderBy: { invoiceDate: 'desc' },
        take: 8,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          grandTotal: true,
          guestName: true,
          status: true,
        },
      }),
    ]);

    const today = {
      bills: todayBills.length,
      revenue: todayBills.reduce((s, b) => s + num(b.grandTotal), 0).toFixed(2),
    };

    const base = {
      today,
      recentBills: recentBills.map((b) => ({
        id: b.id,
        billNumber: b.invoiceNumber,
        date: b.invoiceDate,
        customerName: b.guestName,
        total: b.grandTotal.toString(),
        status: b.status,
      })),
    };

    if (!ctx.isAdmin) {
      return { ...base, financials: null };
    }

    const [monthBills, allBills] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: monthStart, lte: endOfDay(now) },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: { deletedAt: null, status: { notIn: EXCLUDED_FROM_REVENUE } },
        select: { grandTotal: true },
      }),
    ]);

    const totalRevenue = allBills.reduce((s, b) => s + num(b.grandTotal), 0);

    return {
      ...base,
      financials: {
        totalRevenue: totalRevenue.toFixed(2),
        totalBills: allBills.length,
        monthRevenue: monthBills.reduce((s, b) => s + num(b.grandTotal), 0).toFixed(2),
        monthBills: monthBills.length,
        avgBillValue: allBills.length > 0 ? (totalRevenue / allBills.length).toFixed(2) : '0.00',
      },
    };
  }
}
