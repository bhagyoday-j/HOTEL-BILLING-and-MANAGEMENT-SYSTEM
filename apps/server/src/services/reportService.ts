import { getPrisma } from '../utils/prisma';

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

export class ReportService {
  /** Daily/monthly sales + collection summary. */
  async salesSummary(from: Date, to: Date) {
    const prisma = getPrisma();

    const [invoices, orders, payments, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
        include: { items: true },
      }),
      prisma.restaurantOrder.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          status: { notIn: ['CANCELLED'] },
          deletedAt: null,
        },
      }),
      prisma.payment.findMany({
        where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: from, lte: to }, deletedAt: null },
      }),
    ]);

    let roomRevenue = 0;
    let restaurantRevenue = 0;
    let otherRevenue = 0;
    for (const inv of invoices) {
      const total = num(inv.grandTotal);
      const isRoom = inv.items.some((i) => i.sourceType === 'ROOM');
      const isRestaurant = inv.items.some((i) => i.sourceType === 'RESTAURANT');
      if (isRoom) roomRevenue += total;
      else if (isRestaurant) restaurantRevenue += total;
      else otherRevenue += total;
    }

    const byMethod = (m: string) =>
      payments
        .filter((p) => p.method === m)
        .reduce((s, p) => s + num(p.amount), 0);

    const taxCollected = invoices.reduce((s, i) => s + num(i.totalTax), 0);
    const totalDiscount = invoices.reduce((s, i) => s + num(i.discountAmount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0);
    const totalRevenue = roomRevenue + restaurantRevenue + otherRevenue;

    return {
      totalRevenue: totalRevenue.toFixed(2),
      roomRevenue: roomRevenue.toFixed(2),
      restaurantRevenue: restaurantRevenue.toFixed(2),
      otherRevenue: otherRevenue.toFixed(2),
      taxCollected: taxCollected.toFixed(2),
      totalDiscount: totalDiscount.toFixed(2),
      cash: byMethod('CASH').toFixed(2),
      upi: byMethod('UPI').toFixed(2),
      card: byMethod('CARD').toFixed(2),
      bankTransfer: byMethod('BANK_TRANSFER').toFixed(2),
      credit: byMethod('CREDIT').toFixed(2),
      other: byMethod('OTHER').toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netCollection: (totalRevenue - totalExpenses).toFixed(2),
      invoiceCount: invoices.length,
      orderCount: orders.length,
    };
  }

  /** Revenue grouped per day for the chart. */
  async revenueByDay(from: Date, to: Date) {
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      select: { invoiceDate: true, grandTotal: true },
    });

    const map = new Map<string, number>();
    for (const inv of invoices) {
      const key = inv.invoiceDate.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + num(inv.grandTotal));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, total]) => ({ date, total: total.toFixed(2) }));
  }

  /** Payment method split for the chart. */
  async paymentsByMethod(from: Date, to: Date) {
    const prisma = getPrisma();
    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      select: { method: true, amount: true },
    });
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.method, (map.get(p.method) ?? 0) + num(p.amount));
    }
    return Array.from(map.entries()).map(([method, total]) => ({
      method,
      total: total.toFixed(2),
    }));
  }

  /** Top-selling restaurant items by revenue. */
  async topMenuItems(from: Date, to: Date, limit = 10) {
    const prisma = getPrisma();
    const items = await prisma.restaurantOrderItem.findMany({
      where: {
        order: {
          createdAt: { gte: from, lte: to },
          status: { notIn: ['CANCELLED'] },
          deletedAt: null,
        },
      },
      select: { name: true, quantity: true, lineTotal: true },
    });

    const map = new Map<string, { name: string; quantity: number; total: number }>();
    for (const item of items) {
      const key = item.name;
      const prev = map.get(key) ?? { name: key, quantity: 0, total: 0 };
      prev.quantity += num(item.quantity);
      prev.total += num(item.lineTotal);
      map.set(key, prev);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, limit)
      .map((r) => ({
        name: r.name,
        quantity: r.quantity,
        total: r.total.toFixed(2),
      }));
  }

  /** Room occupancy over a date range. */
  async occupancy(from: Date, to: Date) {
    const prisma = getPrisma();
    const [totalRooms, bookings, roomCount] = await Promise.all([
      prisma.room.count({ where: { deletedAt: null, isActive: true } }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          status: { in: ['CHECKED_IN', 'CHECKED_OUT'] },
          actualCheckIn: { not: null },
          OR: [
            { actualCheckIn: { lte: to } },
            { checkInDate: { lte: to } },
          ],
          AND: [
            {
              OR: [
                { actualCheckOut: { gte: from } },
                { checkOutDate: { gte: from } },
                { actualCheckOut: null },
              ],
            },
          ],
        },
        select: {
          roomId: true,
          checkInDate: true,
          checkOutDate: true,
          actualCheckIn: true,
          actualCheckOut: true,
        },
      }),
      prisma.room.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true } }),
    ]);

    const msPerDay = 24 * 60 * 60 * 1000;
    const totalRoomNights = Math.max(
      1,
      Math.ceil((to.getTime() - from.getTime()) / msPerDay) * totalRooms,
    );

    let bookedNights = 0;
    for (const b of bookings) {
      const start = Math.max(
        from.getTime(),
        startOfDayMs(b.actualCheckIn ?? b.checkInDate),
      );
      const end = Math.min(
        to.getTime(),
        b.actualCheckOut ? startOfDayMs(b.actualCheckOut) : Date.now(),
      );
      if (end > start) bookedNights += Math.ceil((end - start) / msPerDay);
    }

    // Per-room breakdown for the report table
    const perRoom = new Map<string, number>();
    for (const b of bookings) {
      const start = Math.max(from.getTime(), startOfDayMs(b.actualCheckIn ?? b.checkInDate));
      const end = Math.min(to.getTime(), b.actualCheckOut ? startOfDayMs(b.actualCheckOut) : Date.now());
      if (end > start) {
        const nights = Math.ceil((end - start) / msPerDay);
        perRoom.set(b.roomId, (perRoom.get(b.roomId) ?? 0) + nights);
      }
    }

    const roomIds = roomCount.map((r) => r.id);
    void roomIds;

    return {
      totalRooms,
      bookedNights,
      totalRoomNights,
      occupancyRate: ((bookedNights / totalRoomNights) * 100).toFixed(1),
    };
  }

  /** Outstanding dues across all invoices. */
  async outstandingDues() {
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueAmount: { gt: 0 },
      },
      include: { guest: true, room: true },
      orderBy: { invoiceDate: 'desc' },
    });
    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      guestName: inv.guestName ?? inv.guest?.fullName ?? 'Walk-in',
      room: inv.room?.number ?? null,
      grandTotal: inv.grandTotal.toString(),
      paidAmount: inv.paidAmount.toString(),
      dueAmount: inv.dueAmount.toString(),
      status: inv.status,
    }));
  }

  /** GST/tax summary grouped by rate for the period. */
  async gstSummary(from: Date, to: Date) {
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      include: { items: true },
    });

    let taxable = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    for (const inv of invoices) {
      taxable += num(inv.taxableAmount);
      cgst += num(inv.cgstAmount);
      sgst += num(inv.sgstAmount);
      igst += num(inv.igstAmount);
    }

    return {
      invoiceCount: invoices.length,
      taxableAmount: taxable.toFixed(2),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      totalTax: (cgst + sgst + igst).toFixed(2),
    };
  }

  /** Guest ledger report. */
  async guestReport(from: Date, to: Date) {
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        invoiceDate: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      include: { guest: true, room: true },
      orderBy: { invoiceDate: 'desc' },
    });

    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      date: inv.invoiceDate,
      guest: inv.guestName ?? inv.guest?.fullName ?? 'Walk-in',
      mobile: inv.guestMobile ?? inv.guest?.mobile ?? null,
      room: inv.room?.number ?? null,
      amount: inv.grandTotal.toString(),
      paid: inv.paidAmount.toString(),
      due: inv.dueAmount.toString(),
      status: inv.status,
    }));
  }

  /** Expense report grouped by category. */
  async expenseReport(from: Date, to: Date) {
    const prisma = getPrisma();
    const expenses = await prisma.expense.findMany({
      where: { expenseDate: { gte: from, lte: to }, deletedAt: null },
      include: { category: true, user: { select: { fullName: true } } },
      orderBy: { expenseDate: 'desc' },
    });

    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      const key = e.category.name;
      byCategory.set(key, (byCategory.get(key) ?? 0) + num(e.amount));
    }

    return {
      items: expenses.map((e) => ({
        id: e.id,
        date: e.expenseDate,
        category: e.category.name,
        description: e.description,
        amount: e.amount.toString(),
        method: e.paymentMethod,
        user: e.user.fullName,
      })),
      byCategory: Array.from(byCategory.entries()).map(([name, total]) => ({
        name,
        total: total.toFixed(2),
      })),
      total: expenses.reduce((s, e) => s + num(e.amount), 0).toFixed(2),
    };
  }

  /** Cancelled invoices report (audit trail). */
  async cancelledInvoices(from: Date, to: Date) {
    const prisma = getPrisma();
    const invoices = await prisma.invoice.findMany({
      where: {
        status: 'CANCELLED',
        deletedAt: null,
        cancelledAt: { gte: from, lte: to },
      },
      include: { createdBy: { select: { fullName: true } } },
      orderBy: { cancelledAt: 'desc' },
    });
    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      cancelledAt: inv.cancelledAt,
      reason: inv.cancelReason,
      amount: inv.grandTotal.toString(),
      cancelledBy: inv.createdBy?.fullName ?? null,
    }));
  }
}

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
