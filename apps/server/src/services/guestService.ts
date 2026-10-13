import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

export interface GuestListOptions {
  search?: string;
  page?: number;
  pageSize?: number;
}

export class GuestService {
  private audit = new AuditService();

  async list(opts: GuestListOptions = {}) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

    const where = opts.search
      ? {
          deletedAt: null,
          OR: [
            { fullName: { contains: opts.search } },
            { mobile: { contains: opts.search } },
            { email: { contains: opts.search } },
            { idNumber: { contains: opts.search } },
            { city: { contains: opts.search } },
          ],
        }
      : { deletedAt: null };

    const [total, items] = await Promise.all([
      prisma.guest.count({ where }),
      prisma.guest.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async searchLite(term: string, limit = 8) {
    const prisma = getPrisma();
    if (!term || term.trim().length < 1) return [];
    return prisma.guest.findMany({
      where: {
        deletedAt: null,
        OR: [{ fullName: { contains: term } }, { mobile: { contains: term } }],
      },
      select: { id: true, fullName: true, mobile: true, city: true },
      take: limit,
      orderBy: { fullName: 'asc' },
    });
  }

  async get(id: string) {
    const prisma = getPrisma();
    const guest = await prisma.guest.findFirst({
      where: { id, deletedAt: null },
      include: { bookings: { orderBy: { checkInDate: 'desc' }, take: 10 } },
    });
    if (!guest) throw new AppError('GUEST_NOT_FOUND', 'Guest not found', 404);
    return guest;
  }

  async create(
    input: {
      fullName: string;
      mobile?: string;
      email?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      idType?: string;
      idNumber?: string;
      nationality?: string;
      notes?: string;
    },
    userId: string,
  ) {
    const prisma = getPrisma();
    const guest = await prisma.guest.create({ data: { ...input } });
    await this.audit.log({
      userId,
      action: 'GUEST_CREATE',
      entityType: 'Guest',
      entityId: guest.id,
      entityRef: guest.fullName,
    });
    return guest;
  }

  async update(
    id: string,
    input: Partial<{
      fullName: string;
      mobile: string;
      email: string;
      address: string;
      city: string;
      state: string;
      country: string;
      idType: string;
      idNumber: string;
      nationality: string;
      notes: string;
    }>,
    userId: string,
  ) {
    const prisma = getPrisma();
    const existing = await prisma.guest.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('GUEST_NOT_FOUND', 'Guest not found', 404);

    const guest = await prisma.guest.update({ where: { id }, data: input });
    await this.audit.log({
      userId,
      action: 'GUEST_UPDATE',
      entityType: 'Guest',
      entityId: guest.id,
      entityRef: guest.fullName,
    });
    return guest;
  }

  /** Soft-delete only; financial history must never be hard deleted. */
  async remove(id: string, userId: string) {
    const prisma = getPrisma();
    const guest = await prisma.guest.findFirst({ where: { id, deletedAt: null } });
    if (!guest) throw new AppError('GUEST_NOT_FOUND', 'Guest not found', 404);

    const activeBookings = await prisma.booking.count({
      where: { guestId: id, status: { in: ['CONFIRMED', 'CHECKED_IN'] }, deletedAt: null },
    });
    if (activeBookings > 0) {
      throw new AppError(
        'GUEST_HAS_ACTIVE_BOOKINGS',
        'Guest has active bookings and cannot be archived',
        409,
      );
    }

    await prisma.guest.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({
      userId,
      action: 'GUEST_DELETE',
      entityType: 'Guest',
      entityId: id,
      entityRef: guest.fullName,
    });
  }
}
