import { getPrisma } from '../utils/prisma';

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export class DashboardService {
  async getSummary() {
    const prisma = getPrisma();
    const from = startOfDay();
    const to = endOfDay();

    const [
      occupiedRooms,
      availableRooms,
      reservedRooms,
      todayInvoices,
      todayCheckIns,
      todayCheckOuts,
      todayOrders,
    ] = await Promise.all([
      prisma.room.count({ where: { status: 'OCCUPIED', deletedAt: null } }),
      prisma.room.count({ where: { status: 'AVAILABLE', deletedAt: null } }),
      prisma.room.count({ where: { status: 'RESERVED', deletedAt: null } }),
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
      }),
      prisma.booking.count({
        where: {
          actualCheckIn: { gte: from, lte: to },
          status: 'CHECKED_IN',
          deletedAt: null,
        },
      }),
      prisma.booking.count({
        where: {
          actualCheckOut: { gte: from, lte: to },
          status: 'CHECKED_OUT',
          deletedAt: null,
        },
      }),
      prisma.restaurantOrder.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
          deletedAt: null,
        },
      }),
    ]);

    const todayRevenue = todayInvoices.reduce(
      (sum, inv) => sum + Number(inv.grandTotal.toString()),
      0,
    );
    const restaurantSales = todayOrders.reduce(
      (sum, ord) => sum + Number(ord.grandTotal.toString()),
      0,
    );

    const payments = await prisma.payment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        deletedAt: null,
      },
    });

    const byMethod = (method: string) =>
      payments
        .filter((p) => p.method === method)
        .reduce((sum, p) => sum + Number(p.amount.toString()), 0);

    return {
      todayRevenue: todayRevenue.toFixed(2),
      todayBills: todayInvoices.length,
      todayCheckIns,
      todayCheckOuts,
      occupiedRooms,
      availableRooms,
      reservedRooms,
      restaurantSales: restaurantSales.toFixed(2),
      cashCollection: byMethod('CASH').toFixed(2),
      upiCollection: byMethod('UPI').toFixed(2),
      cardCollection: byMethod('CARD').toFixed(2),
      creditAmount: byMethod('CREDIT').toFixed(2),
    };
  }
}
