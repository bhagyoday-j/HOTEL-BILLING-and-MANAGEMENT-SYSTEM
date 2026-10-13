import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { nextNumber } from './sequenceService';
import { SettingsService } from './settingsService';
import { calculateBilling, type BillingLineInput } from '@hotel-billing/shared';
import type { Prisma } from '@prisma/client';

const NIGHTS_MIN = 1;

export interface BookingInput {
  guestId: string;
  roomId: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children?: number;
  roomRate?: string;
  discountAmount?: string;
  advancePayment?: string;
  specialRequests?: string;
}

function atNoon(dateStr: string): Date {
  // Store check-in/out dates at noon to avoid DST edge cases in overlap math
  const d = new Date(dateStr);
  d.setHours(12, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export class BookingService {
  private audit = new AuditService();
  private settings = new SettingsService();

  async list(opts: {
    status?: string;
    roomId?: string;
    guestId?: string;
    upcoming?: boolean;
    page?: number;
    pageSize?: number;
    search?: string;
  }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

    const where: Prisma.BookingWhereInput = { deletedAt: null };
    if (opts.status) where.status = opts.status;
    if (opts.roomId) where.roomId = opts.roomId;
    if (opts.guestId) where.guestId = opts.guestId;
    if (opts.upcoming) {
      where.checkOutDate = { gte: new Date() };
      where.status = { in: ['CONFIRMED', 'CHECKED_IN'] };
    }
    if (opts.search) {
      where.OR = [
        { bookingNumber: { contains: opts.search } },
        { guest: { is: { fullName: { contains: opts.search } } } },
        { guest: { is: { mobile: { contains: opts.search } } } },
        { room: { is: { number: { contains: opts.search } } } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: { guest: true, room: { include: { roomType: true } } },
        orderBy: { checkInDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const prisma = getPrisma();
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: {
        guest: true,
        room: { include: { roomType: true } },
        guests: { include: { guest: true } },
        orders: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);
    return booking;
  }

  /** Overlap rule: same room, intersecting dates, blocking statuses. */
  private async assertNoOverlap(
    tx: Prisma.TransactionClient,
    roomId: string,
    checkIn: Date,
    checkOut: Date,
    excludeBookingId?: string,
  ) {
    const clash = await tx.booking.findFirst({
      where: {
        roomId,
        deletedAt: null,
        id: excludeBookingId ? { not: excludeBookingId } : undefined,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
    });
    if (clash) {
      throw new AppError(
        'BOOKING_OVERLAP',
        `Room is already booked for overlapping dates (${clash.bookingNumber})`,
        409,
        { clashWith: clash.bookingNumber },
      );
    }
  }

  async create(input: BookingInput, userId: string) {
    const prisma = getPrisma();
    const checkIn = atNoon(input.checkInDate);
    const checkOut = atNoon(input.checkOutDate);
    if (checkOut <= checkIn) {
      throw new AppError('INVALID_DATES', 'Check-out must be after check-in', 400);
    }

    const booking = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({ where: { id: input.roomId, deletedAt: null } });
      if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);
      if (room.status === 'OCCUPIED') {
        throw new AppError('ROOM_OCCUPIED', 'Room is currently occupied', 409);
      }
      if (room.status === 'MAINTENANCE' || room.status === 'BLOCKED') {
        throw new AppError('ROOM_BLOCKED', `Room ${room.number} is ${room.status}`, 409);
      }

      await this.assertNoOverlap(tx, input.roomId, checkIn, checkOut);

      const guest = await tx.guest.findFirst({ where: { id: input.guestId, deletedAt: null } });
      if (!guest) throw new AppError('GUEST_NOT_FOUND', 'Guest not found', 404);

      const number = await nextNumber(tx, 'BKG');

      return tx.booking.create({
        data: {
          bookingNumber: number,
          guestId: input.guestId,
          roomId: input.roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          adults: input.adults,
          children: input.children ?? 0,
          roomRate: input.roomRate ?? room.price?.toString() ?? room.roomTypeId,
          discountAmount: input.discountAmount ?? '0',
          advancePayment: input.advancePayment ?? '0',
          specialRequests: input.specialRequests,
          status: 'CONFIRMED',
          createdById: userId,
        },
      });
    });

    // First reservation on an AVAILABLE room marks it RESERVED
    const room = await prisma.room.findFirst({ where: { id: input.roomId } });
    if (room && room.status === 'AVAILABLE') {
      await prisma.room.update({ where: { id: input.roomId }, data: { status: 'RESERVED' } });
    }

    await this.audit.log({
      userId,
      action: 'BOOKING_CREATE',
      entityType: 'Booking',
      entityId: booking.id,
      entityRef: booking.bookingNumber,
    });

    return booking;
  }

  async update(
    id: string,
    input: Partial<BookingInput>,
    userId: string,
  ): Promise<unknown> {
    const prisma = getPrisma();
    const existing = await prisma.booking.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);

    if (existing.status === 'CHECKED_IN') {
      throw new AppError(
        'BOOKING_CHECKED_IN',
        'Cannot edit a checked-in booking. Use check-out flow instead.',
        409,
      );
    }
    if (existing.status !== 'CONFIRMED') {
      throw new AppError('BOOKING_NOT_EDITABLE', 'Only confirmed bookings can be edited', 409);
    }

    const checkIn = input.checkInDate ? atNoon(input.checkInDate) : existing.checkInDate;
    const checkOut = input.checkOutDate ? atNoon(input.checkOutDate) : existing.checkOutDate;
    if (checkOut <= checkIn) {
      throw new AppError('INVALID_DATES', 'Check-out must be after check-in', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const roomId = input.roomId ?? existing.roomId;
      if (input.roomId && input.roomId !== existing.roomId) {
        const room = await tx.room.findFirst({ where: { id: input.roomId, deletedAt: null } });
        if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);
        if (room.status === 'OCCUPIED') {
          throw new AppError('ROOM_OCCUPIED', 'Room is occupied', 409);
        }
      }

      await this.assertNoOverlap(tx, roomId, checkIn, checkOut, id);

      return tx.booking.update({
        where: { id },
        data: {
          guestId: input.guestId,
          roomId: input.roomId,
          checkInDate: checkIn,
          checkOutDate: checkOut,
          adults: input.adults,
          children: input.children,
          roomRate: input.roomRate,
          discountAmount: input.discountAmount,
          advancePayment: input.advancePayment,
          specialRequests: input.specialRequests,
        },
      });
    });

    await this.audit.log({
      userId,
      action: 'BOOKING_UPDATE',
      entityType: 'Booking',
      entityId: id,
      entityRef: existing.bookingNumber,
    });
    return updated;
  }

  async cancel(id: string, reason: string, userId: string) {
    const prisma = getPrisma();
    const existing = await prisma.booking.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);

    if (existing.status === 'CHECKED_IN') {
      throw new AppError('BOOKING_CHECKED_IN', 'Check out the guest before cancelling', 409);
    }
    if (existing.status === 'CHECKED_OUT') {
      throw new AppError('BOOKING_FINALIZED', 'Completed stays cannot be cancelled', 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id }, data: { status: 'CANCELLED' } });
      const others = await tx.booking.count({
        where: {
          roomId: existing.roomId,
          id: { not: id },
          status: { in: ['CONFIRMED', 'CHECKED_IN'] },
          deletedAt: null,
        },
      });
      if (others === 0) {
        await tx.room.update({ where: { id: existing.roomId }, data: { status: 'CLEANING' } });
      }
    });

    await this.audit.log({
      userId,
      action: 'BOOKING_CANCEL',
      entityType: 'Booking',
      entityId: id,
      entityRef: existing.bookingNumber,
      details: { reason },
    });
  }

  async checkIn(id: string, userId: string) {
    const prisma = getPrisma();
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: { room: true },
    });
    if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);
    if (booking.status === 'CHECKED_IN') {
      throw new AppError('ALREADY_CHECKED_IN', 'Booking is already checked in', 409);
    }
    if (booking.status !== 'CONFIRMED') {
      throw new AppError('INVALID_BOOKING_STATUS', 'Only confirmed bookings can check in', 409);
    }
    if (booking.room.status === 'OCCUPIED') {
      throw new AppError('ROOM_OCCUPIED', 'Room is occupied by another stay', 409);
    }
    if (booking.room.status === 'MAINTENANCE' || booking.room.status === 'BLOCKED') {
      throw new AppError(
        'ROOM_BLOCKED',
        `Room ${booking.room.number} is ${booking.room.status}`,
        409,
      );
    }

    await prisma.$transaction([
      prisma.booking.update({
        where: { id },
        data: { status: 'CHECKED_IN', actualCheckIn: new Date() },
      }),
      prisma.room.update({ where: { id: booking.roomId }, data: { status: 'OCCUPIED' } }),
    ]);

    await this.audit.log({
      userId,
      action: 'CHECK_IN',
      entityType: 'Booking',
      entityId: id,
      entityRef: booking.bookingNumber,
      details: { room: booking.room.number },
    });

    return this.get(id);
  }

  /**
   * Folio for the checkout screen: room charges for the stay duration plus
   * any unpaid room-service restaurant orders attached to this stay.
   */
  async folio(id: string) {
    const prisma = getPrisma();
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: { guest: true, room: { include: { roomType: true } } },
    });
    if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';
    const cgstRate = settings.cgstRate ?? '0';
    const sgstRate = settings.sgstRate ?? '0';
    const igstRate = settings.igstRate ?? '0';

    const checkIn = booking.actualCheckIn ?? booking.checkInDate;
    const checkOut = booking.actualCheckOut ?? new Date();
    const msPerNight = 24 * 60 * 60 * 1000;
    const rawNights = Math.ceil(
      (startOfDay(checkOut).getTime() - startOfDay(checkIn).getTime()) / msPerNight,
    );
    const nights = Math.max(NIGHTS_MIN, rawNights);

    // Unpaid room-service orders attached to this stay
    const openOrders = await prisma.restaurantOrder.findMany({
      where: {
        bookingId: id,
        status: 'COMPLETED',
        orderType: 'ROOM_SERVICE',
        deletedAt: null,
        invoiceItems: { none: {} },
      },
      orderBy: { createdAt: 'asc' },
    });

    const items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      cgstRate: string;
      sgstRate: string;
      igstRate: string;
      sourceOrderId: string | null;
    }> = [
      {
        description: `Room ${booking.room.number} · ${booking.room.roomType.name} × ${nights} night(s)`,
        quantity: nights,
        unitPrice: Number(booking.roomRate.toString()),
        discountAmount: Number(booking.discountAmount.toString()),
        cgstRate,
        sgstRate,
        igstRate,
        sourceOrderId: null,
      },
      ...openOrders.map((o) => ({
        description: `Restaurant order ${o.orderNumber} (${o.orderType})`,
        quantity: 1,
        unitPrice: Number(o.grandTotal.toString()),
        discountAmount: 0,
        cgstRate: '0',
        sgstRate: '0',
        igstRate: '0',
        sourceOrderId: o.id,
      })),
    ];

    const billingItems: BillingLineInput[] = items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      cgstRate: i.cgstRate,
      sgstRate: i.sgstRate,
      igstRate: i.igstRate,
    }));
    const breakdown = calculateBilling({ items: billingItems, useIgst });

    const advance = Number(booking.advancePayment.toString());
    const dueBeforePayments = Math.max(0, Number(breakdown.grandTotal) - advance);

    return {
      booking,
      nights,
      openOrders: openOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        grandTotal: o.grandTotal.toString(),
      })),
      items,
      breakdown,
      advance,
      dueBeforePayments: dueBeforePayments.toFixed(2),
      settings: { useIgst, cgstRate, sgstRate, igstRate },
    };
  }

  async checkOut(
    id: string,
    userId: string,
    opts: {
      discountAmount?: string;
      payments?: Array<{ method: string; amount: string; reference?: string }>;
      notes?: string;
    },
  ) {
    const prisma = getPrisma();
    const booking = await prisma.booking.findFirst({
      where: { id, deletedAt: null },
      include: { room: true, guest: true },
    });
    if (!booking) throw new AppError('BOOKING_NOT_FOUND', 'Booking not found', 404);
    if (booking.status !== 'CHECKED_IN') {
      throw new AppError('INVALID_BOOKING_STATUS', 'Only checked-in bookings can check out', 409);
    }

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';
    const folioData = await this.folio(id);
    const items = folioData.items;

    const billingItems: BillingLineInput[] = items.map((i) => ({
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discountAmount: i.discountAmount,
      cgstRate: i.cgstRate,
      sgstRate: i.sgstRate,
      igstRate: i.igstRate,
    }));
    const breakdown = calculateBilling({
      items: billingItems,
      useIgst,
      orderDiscountAmount: opts.discountAmount,
    });

    const payments = opts.payments ?? [];
    const paidNow = payments.reduce((s, p) => s + Number(p.amount), 0);
    const advance = folioData.advance;
    const grandTotal = Number(breakdown.grandTotal);
    const paidAmount = Math.min(grandTotal, paidNow + advance);
    const dueAmount = Math.max(0, grandTotal - paidNow - advance);
    const status = dueAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'ISSUED';

    const invoice = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextNumber(tx, 'INV', {
        prefixOverride: settings.invoicePrefix,
      });

      // Allocate payment numbers inside the same transaction
      const paymentNumbers: string[] = [];
      for (let i = 0; i < payments.length; i++) {
        paymentNumbers.push(await nextNumber(tx, 'PAY', { prefixOverride: settings.paymentPrefix }));
      }

      const cgst = settings.cgstRate ?? '0';
      const sgst = settings.sgstRate ?? '0';
      const igst = settings.igstRate ?? '0';

      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          status,
          guestId: booking.guestId,
          guestName: booking.guest.fullName,
          guestMobile: booking.guest.mobile,
          roomId: booking.roomId,
          bookingId: booking.id,
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
          notes: opts.notes,
          terms: settings.termsAndConditions,
          createdById: userId,
          items: {
            create: items.map((i, idx) => ({
              description: i.description,
              quantity: String(i.quantity),
              unitPrice: String(i.unitPrice),
              discountAmount: String(i.discountAmount),
              taxRate: useIgst ? igst : (Number(cgst) + Number(sgst)).toFixed(2),
              lineTotal: (i.quantity * i.unitPrice - i.discountAmount).toFixed(2),
              sourceType: idx === 0 ? 'ROOM' : 'RESTAURANT',
              sourceOrderId: i.sourceOrderId,
              sortOrder: idx,
            })),
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

      // Room-service orders are now settled on the hotel invoice
      for (const o of folioData.openOrders) {
        await tx.restaurantOrder.update({
          where: { id: o.id },
          data: { status: 'CHARGED_TO_ROOM' },
        });
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CHECKED_OUT',
          actualCheckOut: new Date(),
          discountAmount: opts.discountAmount ?? booking.discountAmount,
          taxAmount: breakdown.totalTax,
        },
      });

      await tx.room.update({
        where: { id: booking.roomId },
        data: { status: 'CLEANING' },
      });

      return inv;
    });

    await this.audit.log({
      userId,
      action: 'CHECK_OUT',
      entityType: 'Booking',
      entityId: booking.id,
      entityRef: booking.bookingNumber,
      details: { invoiceNumber: invoice.invoiceNumber, grandTotal: breakdown.grandTotal },
    });

    return prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: {
        items: true,
        payments: true,
        booking: true,
        room: true,
        guest: true,
        createdBy: { select: { fullName: true } },
      },
    });
  }
}
