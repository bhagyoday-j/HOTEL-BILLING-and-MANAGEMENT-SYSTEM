import { calculateBilling, type BillingLineInput } from '@hotel-billing/shared';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { SettingsService } from './settingsService';
import { nextNumber } from './sequenceService';

export interface BillLineInput {
  menuItemId: string;
  quantity: string;
  notes?: string;
}

export interface CreateBillInput {
  /** Idempotency key from the billing UI — a repeated submit returns the existing bill. */
  clientRequestId?: string;
  customerName?: string;
  customerMobile?: string;
  items: BillLineInput[];
  notes?: string;
}

const VALID_STATUSES = ['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'REFUNDED'];

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

/**
 * Customer billing. A bill is an immutable snapshot of the menu items that
 * were billed: item names, prices and tax rates are copied onto the bill
 * lines, so later menu edits never change historical bills.
 *
 * Bills are finalized as PAID on creation (simple daily-billing flow).
 * Cancelled bills are kept for history but excluded from all revenue math.
 */
export class BillService {
  private audit = new AuditService();
  private settings = new SettingsService();

  async list(opts: {
    status?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

    const where: Prisma.InvoiceWhereInput = { deletedAt: null };
    if (opts.status && VALID_STATUSES.includes(opts.status)) where.status = opts.status;
    if (opts.from || opts.to) {
      where.invoiceDate = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    if (opts.search) {
      where.OR = [
        { invoiceNumber: { contains: opts.search } },
        { guestName: { contains: opts.search } },
        { guestMobile: { contains: opts.search } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        include: { createdBy: { select: { fullName: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: items.map((b) => ({
        id: b.id,
        billNumber: b.invoiceNumber,
        status: b.status,
        date: b.invoiceDate,
        customerName: b.guestName,
        customerMobile: b.guestMobile,
        grandTotal: b.grandTotal.toString(),
        subtotal: b.subtotal.toString(),
        totalTax: b.totalTax.toString(),
        createdBy: b.createdBy?.fullName ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async get(id: string) {
    const prisma = getPrisma();
    const bill = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { sourceOrder: { include: { table: { select: { name: true } } } } },
        },
        createdBy: { select: { fullName: true, username: true } },
      },
    });
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill not found', 404);

    return {
      id: bill.id,
      billNumber: bill.invoiceNumber,
      status: bill.status,
      date: bill.invoiceDate,
      customerName: bill.guestName,
      customerMobile: bill.guestMobile,
      subtotal: bill.subtotal.toString(),
      discountAmount: bill.discountAmount.toString(),
      taxableAmount: bill.taxableAmount.toString(),
      cgstAmount: bill.cgstAmount.toString(),
      sgstAmount: bill.sgstAmount.toString(),
      igstAmount: bill.igstAmount.toString(),
      totalTax: bill.totalTax.toString(),
      roundingAmount: bill.roundingAmount.toString(),
      grandTotal: bill.grandTotal.toString(),
      notes: bill.notes,
      terms: bill.terms,
      cancelledAt: bill.cancelledAt,
      cancelReason: bill.cancelReason,
      // Table bills snapshot their source order; expose the table for history.
      tableNumber:
        bill.items.find((item) => item.sourceOrder?.table)?.sourceOrder?.table?.name ?? null,
      createdBy: bill.createdBy?.fullName ?? null,
      items: bill.items.map((i) => ({
        id: i.id,
        name: i.description,
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        taxRate: i.taxRate.toString(),
        lineTotal: i.lineTotal.toString(),
      })),
    };
  }

  /**
   * Create and finalize a bill in one transaction.
   * Prices/tax rates are re-read from the menu server-side (never trusted
   * from the client) and snapshotted onto the bill lines.
   */
  async create(input: CreateBillInput, userId: string) {
    const prisma = getPrisma();

    if (!input.items?.length) {
      throw new AppError('EMPTY_BILL', 'Add at least one item to the bill', 400);
    }

    // Duplicate-submit protection: same idempotency key returns the first bill.
    if (input.clientRequestId) {
      const existing = await prisma.invoice.findUnique({
        where: { clientRequestId: input.clientRequestId },
      });
      if (existing) return this.get(existing.id);
    }

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';

    try {
      const bill = await prisma.$transaction(async (tx) => {
        if (input.clientRequestId) {
          const existing = await tx.invoice.findUnique({
            where: { clientRequestId: input.clientRequestId },
          });
          if (existing) return existing;
        }

        const lines: Array<{
          name: string;
          quantity: number;
          unitPrice: string;
          taxRate: string;
          billingLine: BillingLineInput;
        }> = [];

        for (const line of input.items) {
          const qty = Number(line.quantity);
          if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
            throw new AppError('INVALID_QUANTITY', 'Quantity must be a positive whole number', 400);
          }

          const menuItem = await tx.menuItem.findFirst({
            where: { id: line.menuItemId, deletedAt: null, isActive: true },
          });
          if (!menuItem) {
            throw new AppError('MENU_ITEM_NOT_FOUND', 'A selected menu item no longer exists', 404);
          }
          if (!menuItem.isAvailable) {
            throw new AppError(
              'MENU_ITEM_UNAVAILABLE',
              `"${menuItem.name}" is no longer available`,
              409,
            );
          }

          const price = menuItem.price.toString();
          const taxRate = menuItem.taxRate.toString();
          const half = (num(taxRate) / 2).toFixed(4);

          lines.push({
            name: menuItem.name,
            quantity: qty,
            unitPrice: price,
            taxRate,
            billingLine: useIgst
              ? { quantity: String(qty), unitPrice: price, igstRate: taxRate }
              : { quantity: String(qty), unitPrice: price, cgstRate: half, sgstRate: half },
          });
        }

        const breakdown = calculateBilling({ items: lines.map((l) => l.billingLine), useIgst });

        const billNumber = await nextNumber(tx, 'INV', {
          prefixOverride: settings.invoicePrefix,
        });

        return tx.invoice.create({
          data: {
            invoiceNumber: billNumber,
            clientRequestId: input.clientRequestId ?? null,
            status: 'PAID',
            guestName: input.customerName?.trim() || null,
            guestMobile: input.customerMobile?.trim() || null,
            subtotal: breakdown.subtotal,
            discountAmount: breakdown.itemDiscount,
            taxableAmount: breakdown.taxableAmount,
            cgstAmount: breakdown.cgst,
            sgstAmount: breakdown.sgst,
            igstAmount: breakdown.igst,
            totalTax: breakdown.totalTax,
            roundingAmount: breakdown.rounding,
            grandTotal: breakdown.grandTotal,
            paidAmount: breakdown.grandTotal,
            dueAmount: '0',
            notes: input.notes || null,
            terms: settings.termsAndConditions ?? null,
            createdById: userId,
            items: {
              create: lines.map((l, idx) => ({
                description: l.name,
                quantity: String(l.quantity),
                unitPrice: l.unitPrice,
                taxRate: l.taxRate,
                lineTotal: (l.quantity * num(l.unitPrice)).toFixed(2),
                sourceType: 'MENU',
                sortOrder: idx,
              })),
            },
          },
        });
      });

      await this.audit.log({
        userId,
        action: 'BILL_CREATE',
        entityType: 'Invoice',
        entityId: bill.id,
        entityRef: bill.invoiceNumber,
        details: { grandTotal: bill.grandTotal.toString(), items: input.items.length },
      });

      return this.get(bill.id);
    } catch (err) {
      // Race on the unique idempotency key: another submit won — return its bill.
      if (input.clientRequestId && isUniqueViolation(err)) {
        const existing = await prisma.invoice.findUnique({
          where: { clientRequestId: input.clientRequestId },
        });
        if (existing) return this.get(existing.id);
      }
      throw err;
    }
  }

  /**
   * Cancel a bill — never delete. Financial history stays intact.
   *
   * Cancellation is a one-way transition, so the status flip is conditional on
   * the bill not already being cancelled: a duplicate submit (double click,
   * retry, second user) updates zero rows and is rejected instead of logging a
   * second cancellation or overwriting the original reason. Revenue is summed
   * from the bills that are not cancelled, so a single status change removes the
   * amount from every revenue figure exactly once and cannot deduct it twice.
   */
  async cancel(id: string, reason: string, userId: string) {
    const prisma = getPrisma();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new AppError('CANCEL_REASON_REQUIRED', 'A cancellation reason is required', 400);
    }

    const bill = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
    if (!bill) throw new AppError('BILL_NOT_FOUND', 'Bill not found', 404);
    if (bill.status === 'CANCELLED') {
      throw new AppError('ALREADY_CANCELLED', 'Bill is already cancelled', 409);
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const { count } = await tx.invoice.updateMany({
        where: { id, deletedAt: null, status: { not: 'CANCELLED' } },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: trimmedReason },
      });
      // Another request cancelled the bill first — do not log a duplicate.
      if (count === 0) return false;

      await this.audit.log(
        {
          userId,
          action: 'BILL_CANCEL',
          entityType: 'Invoice',
          entityId: id,
          entityRef: bill.invoiceNumber,
          details: { reason: trimmedReason, grandTotal: bill.grandTotal.toString() },
        },
        tx,
      );
      return true;
    });

    if (!cancelled) {
      throw new AppError('ALREADY_CANCELLED', 'Bill is already cancelled', 409);
    }
    return { cancelled: true };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}
