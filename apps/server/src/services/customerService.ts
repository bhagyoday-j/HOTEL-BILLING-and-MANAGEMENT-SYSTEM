import { getPrisma } from '../utils/prisma';

/**
 * A customer is not a separate table — it is derived from the bills that were
 * created for them. This keeps a single source of truth (billing history) and
 * avoids a migration: a customer's "visits" are exactly the bills billed to
 * that customer.
 *
 * Identity is resolved in this order:
 *   1. Mobile number (digits only, 7+ digits) — the strongest signal.
 *   2. Name (trimmed, whitespace-collapsed, lower-cased) when no mobile.
 * Anonymous walk-ins with neither are not treated as customers.
 *
 * `visits` counts every bill (a cancelled bill still represents a visit),
 * while `totalSpent` only sums finalized (non-cancelled) revenue so it matches
 * the analytics revenue figures.
 */

/** Statuses excluded from "amount spent" so customer spend matches revenue. */
const REVENUE_EXCLUDED_STATUSES = new Set(['CANCELLED', 'DRAFT', 'REFUNDED']);

export interface RawBillForCustomer {
  invoiceNumber: string;
  guestName: string | null;
  guestMobile: string | null;
  grandTotal: unknown;
  status: string;
  invoiceDate: Date;
}

export interface CustomerSummary {
  key: string;
  name: string | null;
  mobile: string | null;
  visits: number;
  totalSpent: string;
  lastBillNumber: string;
  firstVisit: string;
  lastVisit: string;
}

export function normalizeMobile(mobile?: string | null): string {
  return (mobile ?? '').replace(/\D/g, '');
}

export function normalizeName(name?: string | null): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Stable identity key for a customer, or null for an anonymous walk-in. */
export function customerKey(name?: string | null, mobile?: string | null): string | null {
  const digits = normalizeMobile(mobile);
  if (digits.length >= 7) return `mobile:${digits}`;
  const normalizedName = normalizeName(name);
  if (normalizedName) return `name:${normalizedName}`;
  return null;
}

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

/**
 * Fold a list of bills into per-customer summaries, newest activity first.
 * Pure and synchronous so it can be unit-tested without a database.
 */
export function summarizeCustomers(bills: RawBillForCustomer[]): CustomerSummary[] {
  const byKey = new Map<
    string,
    {
      name: string | null;
      mobile: string | null;
      visits: number;
      spent: number;
      lastBillNumber: string;
      firstVisit: Date;
      lastVisit: Date;
      lastVisitName: string | null;
      lastVisitMobile: string | null;
    }
  >();

  for (const bill of bills) {
    const key = customerKey(bill.guestName, bill.guestMobile);
    if (!key) continue;

    const existing = byKey.get(key);
    const date = new Date(bill.invoiceDate);
    if (!existing) {
      byKey.set(key, {
        name: bill.guestName?.trim() || null,
        mobile: bill.guestMobile?.trim() || null,
        visits: 1,
        spent: REVENUE_EXCLUDED_STATUSES.has(bill.status) ? 0 : num(bill.grandTotal),
        lastBillNumber: bill.invoiceNumber,
        firstVisit: date,
        lastVisit: date,
        lastVisitName: bill.guestName?.trim() || null,
        lastVisitMobile: bill.guestMobile?.trim() || null,
      });
      continue;
    }

    existing.visits += 1;
    if (!REVENUE_EXCLUDED_STATUSES.has(bill.status)) existing.spent += num(bill.grandTotal);
    if (date < existing.firstVisit) existing.firstVisit = date;
    // Keep the most recent bill's details (name/mobile may have been refined).
    if (date >= existing.lastVisit) {
      existing.lastVisit = date;
      existing.lastBillNumber = bill.invoiceNumber;
      existing.lastVisitName = bill.guestName?.trim() || existing.lastVisitName;
      existing.lastVisitMobile = bill.guestMobile?.trim() || existing.lastVisitMobile;
    }
  }

  return Array.from(byKey.entries())
    .map(([key, c]) => ({
      key,
      name: c.lastVisitName ?? c.name,
      mobile: c.lastVisitMobile ?? c.mobile,
      visits: c.visits,
      totalSpent: c.spent.toFixed(2),
      lastBillNumber: c.lastBillNumber,
      firstVisit: c.firstVisit.toISOString(),
      lastVisit: c.lastVisit.toISOString(),
    }))
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
}

/** Customer directory and returning-customer lookup, derived from bills. */
export class CustomerService {
  /**
   * Visit counts require folding every matching bill, so summary search runs
   * over the customer projections (not a SQL WHERE on the raw bills) to keep
   * matching consistent across a customer's name/mobile.
   */
  private async allSummaries(): Promise<CustomerSummary[]> {
    const prisma = getPrisma();
    const bills = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        OR: [{ guestName: { not: null } }, { guestMobile: { not: null } }],
      },
      select: {
        invoiceNumber: true,
        guestName: true,
        guestMobile: true,
        grandTotal: true,
        status: true,
        invoiceDate: true,
      },
      orderBy: { invoiceDate: 'asc' },
    });
    return summarizeCustomers(bills);
  }

  async list(opts: { search?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const term = (opts.search ?? '').trim().toLowerCase();

    let summaries = await this.allSummaries();
    if (term) {
      summaries = summaries.filter((c) =>
        (c.mobile ?? '').toLowerCase().includes(term) ||
        (c.name ?? '').toLowerCase().includes(term) ||
        c.key.toLowerCase().includes(term),
      );
    }

    const total = summaries.length;
    const start = (page - 1) * pageSize;
    return { items: summaries.slice(start, start + pageSize), total, page, pageSize };
  }

  /** Look up a single customer by mobile (preferred) or name. */
  async lookup(opts: { mobile?: string; name?: string }): Promise<CustomerSummary | null> {
    const key = customerKey(opts.name, opts.mobile);
    if (!key) return null;
    const summaries = await this.allSummaries();
    return summaries.find((c) => c.key === key) ?? null;
  }
}
