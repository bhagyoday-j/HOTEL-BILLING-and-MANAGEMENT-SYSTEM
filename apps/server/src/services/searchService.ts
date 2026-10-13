import { getPrisma } from '../utils/prisma';

/** Global search across guests, invoices, bookings, rooms, orders, payments. */
export class SearchService {
  async search(term: string) {
    const prisma = getPrisma();
    const q = term.trim();
    if (q.length < 2) {
      return { guests: [], invoices: [], bookings: [], rooms: [], orders: [], payments: [] };
    }

    const [guests, invoices, bookings, rooms, orders, payments] = await Promise.all([
      prisma.guest.findMany({
        where: {
          deletedAt: null,
          OR: [{ fullName: { contains: q } }, { mobile: { contains: q } }, { idNumber: { contains: q } }],
        },
        select: { id: true, fullName: true, mobile: true, city: true },
        take: 5,
      }),
      prisma.invoice.findMany({
        where: {
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: q } },
            { guestName: { contains: q } },
            { guestMobile: { contains: q } },
          ],
        },
        select: {
          id: true,
          invoiceNumber: true,
          guestName: true,
          grandTotal: true,
          status: true,
          invoiceDate: true,
        },
        take: 5,
        orderBy: { invoiceDate: 'desc' },
      }),
      prisma.booking.findMany({
        where: {
          deletedAt: null,
          OR: [
            { bookingNumber: { contains: q } },
            { guest: { is: { fullName: { contains: q } } } },
            { guest: { is: { mobile: { contains: q } } } },
            { room: { is: { number: { contains: q } } } },
          ],
        },
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          checkInDate: true,
          checkOutDate: true,
          guest: { select: { fullName: true } },
          room: { select: { number: true } },
        },
        take: 5,
        orderBy: { checkInDate: 'desc' },
      }),
      prisma.room.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          OR: [{ number: { contains: q } }],
        },
        select: { id: true, number: true, status: true, floor: true },
        take: 5,
        orderBy: { number: 'asc' },
      }),
      prisma.restaurantOrder.findMany({
        where: {
          deletedAt: null,
          OR: [{ orderNumber: { contains: q } }, { kotNumber: { contains: q } }, { guestName: { contains: q } }],
        },
        select: { id: true, orderNumber: true, kotNumber: true, status: true, grandTotal: true, createdAt: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.payment.findMany({
        where: {
          deletedAt: null,
          OR: [{ paymentNumber: { contains: q } }, { reference: { contains: q } }],
        },
        select: {
          id: true,
          paymentNumber: true,
          method: true,
          amount: true,
          createdAt: true,
          invoice: { select: { invoiceNumber: true } },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { guests, invoices, bookings, rooms, orders, payments };
  }
}
