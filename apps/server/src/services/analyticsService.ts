import { REVENUE_EXCLUDED_STATUSES } from '@hotel-billing/shared';
import { getPrisma } from '../utils/prisma';
import { startOfDay, endOfDay } from '../utils/dates';

type GroupBy = 'day' | 'week' | 'month';

/** Revenue = finalized bills only; cancelled/draft bills are excluded. */
const EXCLUDED_FROM_REVENUE = [...REVENUE_EXCLUDED_STATUSES];

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

export interface RevenueBucket {
  period: string;
  revenue: number;
  bills: number;
}

interface BillForRevenue {
  invoiceDate: Date;
  grandTotal: string | number | { toString(): string };
}

/** Chronological YYYY-MM keys for the last `count` months, ending with `today`'s month. */
export function lastMonthKeys(today: Date, count = 12): string[] {
  const keys: string[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth() - (count - 1), 1);
  for (let index = 0; index < count; index += 1) {
    keys.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

/** Monthly revenue for a fixed window; months with no sales stay at zero. */
export function buildMonthlyRevenueSeries(
  bills: BillForRevenue[],
  monthKeys: string[],
): RevenueBucket[] {
  const buckets = new Map<string, RevenueBucket>(
    monthKeys.map((period) => [period, { period, revenue: 0, bills: 0 }]),
  );
  for (const bill of bills) {
    const bucket = buckets.get(monthKey(bill.invoiceDate));
    if (!bucket) continue;
    bucket.revenue += num(bill.grandTotal);
    bucket.bills += 1;
  }
  return Array.from(buckets.values());
}

/** Highest-revenue days, highest first; ties go to more bills, then earlier date. */
export function topSellingDays(bills: BillForRevenue[], limit = 5): RevenueBucket[] {
  const buckets = new Map<string, RevenueBucket>();
  for (const bill of bills) {
    const period = dayKey(bill.invoiceDate);
    const bucket = buckets.get(period) ?? { period, revenue: 0, bills: 0 };
    bucket.revenue += num(bill.grandTotal);
    bucket.bills += 1;
    buckets.set(period, bucket);
  }
  return Array.from(buckets.values())
    .sort(
      (a, b) =>
        b.revenue - a.revenue || b.bills - a.bills || a.period.localeCompare(b.period),
    )
    .slice(0, Math.max(0, limit));
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Monday-based week start key (ISO-style). */
function weekKey(d: Date): string {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0 … Sun=6
  date.setDate(date.getDate() - day);
  return dayKey(date);
}

function bucketKey(d: Date, groupBy: GroupBy): string {
  if (groupBy === 'month') return monthKey(d);
  if (groupBy === 'week') return weekKey(d);
  return dayKey(d);
}

/**
 * Owner analytics. Revenue is computed from finalized (non-cancelled) bills
 * only. Profit is intentionally never returned: the application does not
 * track item costs or expenses, so there is no basis for a profit figure.
 */
export class AnalyticsService {
  async summary(opts: { from: Date; to: Date; groupBy: GroupBy }) {
    const prisma = getPrisma();
    const { from, to, groupBy } = opts;

    const bills = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { notIn: EXCLUDED_FROM_REVENUE },
        invoiceDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        grandTotal: true,
        guestName: true,
        status: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const revenue = bills.reduce((sum, b) => sum + num(b.grandTotal), 0);
    const billCount = bills.length;

    // Fixed-window metrics (independent of the selected range).
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyStart = new Date(today.getFullYear(), today.getMonth() - 11, 1);

    const [todayBills, monthBills, monthlyBills] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: startOfDay(today), lte: endOfDay(today) },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: monthStart, lte: endOfDay(today) },
        },
        select: { grandTotal: true },
      }),
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: monthlyStart, lte: endOfDay(today) },
        },
        select: { invoiceDate: true, grandTotal: true },
      }),
    ]);

    const monthlyRevenue = buildMonthlyRevenueSeries(
      monthlyBills,
      lastMonthKeys(today, 12),
    );
    const bestDays = topSellingDays(bills, 5);

    // Sales breakdown over the selected range.
    const seriesMap = new Map<string, { period: string; revenue: number; bills: number }>();
    // Walk from `from` to `to` so empty periods still appear on the chart.
    if (groupBy === 'month') {
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cursor <= to) {
        seriesMap.set(monthKey(cursor), { period: monthKey(cursor), revenue: 0, bills: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else if (groupBy === 'week') {
      // Start at the Monday of the week containing `from` so empty week buckets
      // still appear on the chart, matching the day/month branches.
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
      while (cursor <= to) {
        seriesMap.set(weekKey(cursor), { period: weekKey(cursor), revenue: 0, bills: 0 });
        cursor.setDate(cursor.getDate() + 7);
      }
    } else if (groupBy === 'day') {
      const cursor = new Date(from);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= to) {
        seriesMap.set(dayKey(cursor), { period: dayKey(cursor), revenue: 0, bills: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const b of bills) {
      const key = bucketKey(b.invoiceDate, groupBy);
      const entry = seriesMap.get(key) ?? { period: key, revenue: 0, bills: 0 };
      entry.revenue += num(b.grandTotal);
      entry.bills += 1;
      seriesMap.set(key, entry);
    }
    const series = Array.from(seriesMap.values()).sort((a, b) => a.period.localeCompare(b.period));

    // Best-selling items from billed line snapshots (history-stable).
    const lineItems = await prisma.invoiceItem.findMany({
      where: {
        invoice: {
          deletedAt: null,
          status: { notIn: EXCLUDED_FROM_REVENUE },
          invoiceDate: { gte: from, lte: to },
        },
      },
      select: { description: true, quantity: true, lineTotal: true },
    });
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const li of lineItems) {
      const entry = itemMap.get(li.description) ?? { name: li.description, quantity: 0, revenue: 0 };
      entry.quantity += num(li.quantity);
      entry.revenue += num(li.lineTotal);
      itemMap.set(li.description, entry);
    }
    const bestSellers = Array.from(itemMap.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10);

    return {
      range: { from: dayKey(from), to: dayKey(to), groupBy },
      totals: {
        revenue: revenue.toFixed(2),
        bills: billCount,
        avgBillValue: billCount > 0 ? (revenue / billCount).toFixed(2) : '0.00',
      },
      today: {
        revenue: todayBills.reduce((s, b) => s + num(b.grandTotal), 0).toFixed(2),
        bills: todayBills.length,
      },
      month: {
        revenue: monthBills.reduce((s, b) => s + num(b.grandTotal), 0).toFixed(2),
        bills: monthBills.length,
      },
      /** Fixed rolling 12-month revenue, independent of the selected range. */
      monthlyRevenue,
      /** Highest-revenue day in the selected range and the top five such days. */
      bestDay: bestDays[0] ?? null,
      bestDays,
      series,
      bestSellers,
      recentBills: bills.slice(0, 10).map((b) => ({
        id: b.id,
        billNumber: b.invoiceNumber,
        date: b.invoiceDate,
        customerName: b.guestName,
        total: b.grandTotal.toString(),
        status: b.status,
        createdBy: b.createdBy?.fullName ?? null,
      })),
      /**
       * Explicit note for the UI: these figures are sales revenue, not profit.
       * The application does not capture item costs or expenses.
       */
      note: 'Figures are sales revenue from finalized bills (cancelled bills excluded). Profit is not shown because item costs/expenses are not tracked.',
    };
  }
}
