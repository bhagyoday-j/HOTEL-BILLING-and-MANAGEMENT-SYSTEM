import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { SettingsService } from './settingsService';
import { nextNumber } from './sequenceService';
import { calculateBilling, type BillingLineInput } from '@hotel-billing/shared';
import type { Prisma } from '@prisma/client';

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'] as const;

export interface InvoiceItemInput {
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount?: string;
  taxRate?: string; // percent, e.g. "18" — applied as CGST/SGST split or IGST
}

export interface CreateInvoiceInput {
  guestId?: string;
  guestName?: string;
  guestMobile?: string;
  roomId?: string;
  items: InvoiceItemInput[];
  orderDiscountAmount?: string;
  payments?: Array<{ method: string; amount: string; reference?: string }>;
  notes?: string;
}

export class InvoiceService {
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
    if (opts.status) where.status = opts.status;
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
        include: { room: true, createdBy: { select: { fullName: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const prisma = getPrisma();
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
        guest: true,
        room: true,
        booking: true,
        createdBy: { select: { fullName: true } },
      },
    });
    if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    return invoice;
  }

  private recalcStatus(grandTotal: number, paidAmount: number): string {
    if (paidAmount <= 0) return 'ISSUED';
    if (paidAmount >= grandTotal) return 'PAID';
    return 'PARTIALLY_PAID';
  }

  async create(input: CreateInvoiceInput, userId: string) {
    const prisma = getPrisma();
    if (!input.items || input.items.length === 0) {
      throw new AppError('EMPTY_INVOICE', 'Invoice needs at least one line item', 400);
    }

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';

    const billingItems: BillingLineInput[] = input.items.map((i) => {
      const rate = i.taxRate ?? '0';
      if (useIgst) {
        return {
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discountAmount: i.discountAmount,
          igstRate: rate,
        };
      }
      // Split tax rate across CGST/SGST halves
      const half = (Number(rate) / 2).toFixed(4);
      return {
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
        cgstRate: half,
        sgstRate: half,
      };
    });

    const breakdown = calculateBilling({
      items: billingItems,
      useIgst,
      orderDiscountAmount: input.orderDiscountAmount,
    });

    const payments = input.payments ?? [];
    const paidNow = payments.reduce((s, p) => s + Number(p.amount), 0);
    const grandTotal = Number(breakdown.grandTotal);
    if (paidNow > grandTotal) {
      throw new AppError('OVERPAYMENT', 'Payment exceeds the invoice total', 400);
    }
    const paidAmount = Math.min(grandTotal, paidNow);
    const dueAmount = Math.max(0, grandTotal - paidNow);
    const status = dueAmount === 0 ? 'PAID' : this.recalcStatus(grandTotal, paidAmount);

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextNumber(tx, 'INV', {
        prefixOverride: settings.invoicePrefix,
      });
      const paymentNumbers: string[] = [];
      for (let i = 0; i < payments.length; i++) {
        paymentNumbers.push(await nextNumber(tx, 'PAY', { prefixOverride: settings.paymentPrefix }));
      }

      return tx.invoice.create({
        data: {
          invoiceNumber,
          status,
          guestId: input.guestId,
          guestName: input.guestName,
          guestMobile: input.guestMobile,
          roomId: input.roomId,
          subtotal: breakdown.subtotal,
          discountAmount: breakdown.itemDiscount,
          taxableAmount: breakdown.taxableAmount,
          cgstAmount: breakdown.cgst,
          sgstAmount: breakdown.sgst,
          igstAmount: breakdown.igst,
          totalTax: breakdown.totalTax,
          roundingAmount: breakdown.rounding,
          grandTotal: breakdown.grandTotal,
          paidAmount: paidAmount.toFixed(2),
          dueAmount: dueAmount.toFixed(2),
          notes: input.notes,
          terms: settings.termsAndConditions,
          createdById: userId,
          items: {
            create: input.items.map((i, idx) => {
              const rate = Number(i.taxRate ?? '0');
              return {
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                discountAmount: i.discountAmount ?? '0',
                taxRate: i.taxRate ?? '0',
                lineTotal: (
                  Number(i.quantity) * Number(i.unitPrice) - Number(i.discountAmount ?? '0')
                ).toFixed(2),
                sourceType: 'OTHER',
                sortOrder: idx,
                ...(rate > 0
                  ? useIgst
                    ? { igstAmount: breakdown.igst }
                    : {
                        cgstAmount: breakdown.cgst,
                        sgstAmount: breakdown.sgst,
                      }
                  : {}),
              };
            }),
          },
          payments: {
            create: payments.map((p, i) => ({
              paymentNumber: paymentNumbers[i],
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              createdById: userId,
            })),
          },
        },
        include: { items: true, payments: true },
      });
    });

    await this.audit.log({
      userId,
      action: 'CREATE_INVOICE',
      entityType: 'Invoice',
      entityId: invoice.id,
      entityRef: invoice.invoiceNumber,
      details: { grandTotal: invoice.grandTotal.toString() },
    });

    return invoice;
  }

  /** Record a payment against an existing invoice. Atomic. */
  async addPayment(
    invoiceId: string,
    payment: { method: string; amount: string; reference?: string },
    userId: string,
  ) {
    const prisma = getPrisma();
    if (!PAYMENT_METHODS.includes(payment.method as (typeof PAYMENT_METHODS)[number])) {
      throw new AppError('INVALID_PAYMENT_METHOD', `Unknown method: ${payment.method}`, 400);
    }
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Payment amount must be positive', 400);
    }

    const settings = await this.settings.all();

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, deletedAt: null },
      });
      if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
      if (invoice.status === 'CANCELLED' || invoice.status === 'REFUNDED') {
        throw new AppError('INVOICE_FINALIZED', `Invoice is ${invoice.status}`, 409);
      }

      const grandTotal = Number(invoice.grandTotal.toString());
      const paid = Number(invoice.paidAmount.toString());
      const due = Number(invoice.dueAmount.toString());
      if (amount > due + 0.001) {
        throw new AppError(
          'OVERPAYMENT',
          `Payment ${amount} exceeds due amount ${due.toFixed(2)}`,
          400,
        );
      }

      const paymentNumber = await nextNumber(tx, 'PAY', {
        prefixOverride: settings.paymentPrefix,
      });

      const newPaid = Math.min(grandTotal, paid + amount);
      const newDue = Math.max(0, grandTotal - paid - amount);
      const newStatus =
        newDue === 0 ? 'PAID' : this.recalcStatus(grandTotal, newPaid);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid.toFixed(2), dueAmount: newDue.toFixed(2), status: newStatus },
      });

      return tx.payment.create({
        data: {
          paymentNumber,
          invoiceId,
          method: payment.method,
          amount: payment.amount,
          reference: payment.reference,
          createdById: userId,
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'CREATE_PAYMENT',
      entityType: 'Payment',
      entityId: result.id,
      entityRef: result.paymentNumber,
      details: { invoiceId, amount: payment.amount, method: payment.method },
    });

    return result;
  }

  /** Cancel — never delete. Financial history stays intact. */
  async cancel(id: string, reason: string, userId: string) {
    const prisma = getPrisma();
    const invoice = await prisma.invoice.findFirst({ where: { id, deletedAt: null } });
    if (!invoice) throw new AppError('INVOICE_NOT_FOUND', 'Invoice not found', 404);
    if (invoice.status === 'CANCELLED') {
      throw new AppError('ALREADY_CANCELLED', 'Invoice is already cancelled', 409);
    }
    if (invoice.status === 'REFUNDED') {
      throw new AppError('INVOICE_FINALIZED', 'Refunded invoices cannot be cancelled', 409);
    }

    await prisma.$transaction(async (tx) => {
      // Reverse payment status on the invoice but keep payment rows
      await tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      });
    });

    await this.audit.log({
      userId,
      action: 'CANCEL_INVOICE',
      entityType: 'Invoice',
      entityId: id,
      entityRef: invoice.invoiceNumber,
      details: { reason },
    });
  }
}
