import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

export interface RoomInput {
  number: string;
  floor: number;
  roomTypeId: string;
  price?: string;
  capacity?: number;
  status?: string;
  description?: string;
  isActive?: boolean;
}

const VALID_STATUSES = ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING', 'MAINTENANCE', 'BLOCKED'];

export class RoomService {
  private audit = new AuditService();

  async list() {
    const prisma = getPrisma();
    return prisma.room.findMany({
      where: { deletedAt: null, isActive: true },
      include: { roomType: true },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
  }

  async grid() {
    const rooms = await this.list();
    return rooms.map((room) => ({
      id: room.id,
      number: room.number,
      floor: room.floor,
      status: room.status,
      typeName: room.roomType.name,
      price: room.price?.toString() ?? room.roomType.basePrice.toString(),
      capacity: room.capacity ?? room.roomType.maxGuests,
      description: room.description,
    }));
  }

  async get(id: string) {
    const prisma = getPrisma();
    const room = await prisma.room.findFirst({
      where: { id, deletedAt: null },
      include: { roomType: true },
    });
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);

    const activeBooking = await prisma.booking.findFirst({
      where: {
        roomId: id,
        status: 'CHECKED_IN',
        deletedAt: null,
      },
      include: { guest: true },
      orderBy: { actualCheckIn: 'desc' },
    });

    return { ...room, currentBooking: activeBooking };
  }

  async create(input: RoomInput, userId: string) {
    const prisma = getPrisma();
    const existing = await prisma.room.findFirst({ where: { number: input.number } });
    if (existing) {
      throw new AppError('ROOM_NUMBER_EXISTS', `Room ${input.number} already exists`, 409);
    }

    const room = await prisma.room.create({
      data: {
        number: input.number,
        floor: input.floor,
        roomTypeId: input.roomTypeId,
        price: input.price,
        capacity: input.capacity,
        status: input.status && VALID_STATUSES.includes(input.status) ? input.status : 'AVAILABLE',
        description: input.description,
        isActive: input.isActive ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: 'ROOM_CREATE',
      entityType: 'Room',
      entityId: room.id,
      entityRef: room.number,
    });
    return room;
  }

  async update(
    id: string,
    input: Partial<RoomInput>,
    userId: string,
  ) {
    const prisma = getPrisma();
    const room = await prisma.room.findFirst({ where: { id, deletedAt: null } });
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);

    if (input.number && input.number !== room.number) {
      const dup = await prisma.room.findFirst({ where: { number: input.number } });
      if (dup) throw new AppError('ROOM_NUMBER_EXISTS', `Room ${input.number} already exists`, 409);
    }

    // Business rule: room cannot become AVAILABLE while an active stay exists
    if (input.status === 'AVAILABLE' && room.status === 'OCCUPIED') {
      const activeStay = await prisma.booking.findFirst({
        where: { roomId: id, status: 'CHECKED_IN', deletedAt: null },
      });
      if (activeStay) {
        throw new AppError(
          'ROOM_OCCUPIED',
          'Room has an active stay. Check out the guest first.',
          409,
        );
      }
    }

    // Never flip occupancy via edit; that flow belongs to check-in/out
    const { status, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    if (status !== undefined) {
      if (status === 'OCCUPIED') {
        throw new AppError(
          'INVALID_ROOM_STATUS',
          'Use check-in to occupy a room, not manual edit',
          400,
        );
      }
      if (!VALID_STATUSES.includes(status)) {
        throw new AppError('INVALID_ROOM_STATUS', `Invalid room status: ${status}`, 400);
      }
      data.status = status;
    }

    const updated = await prisma.room.update({ where: { id }, data });
    await this.audit.log({
      userId,
      action: 'ROOM_UPDATE',
      entityType: 'Room',
      entityId: id,
      entityRef: updated.number,
    });
    return updated;
  }

  /** Soft delete only. Rooms referenced by bookings/invoices stay in history. */
  async remove(id: string, userId: string) {
    const prisma = getPrisma();
    const room = await prisma.room.findFirst({ where: { id, deletedAt: null } });
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);

    if (room.status === 'OCCUPIED') {
      throw new AppError('ROOM_OCCUPIED', 'Cannot archive an occupied room', 409);
    }

    await prisma.room.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.audit.log({
      userId,
      action: 'ROOM_DELETE',
      entityType: 'Room',
      entityId: id,
      entityRef: room.number,
    });
  }

  async listTypes() {
    const prisma = getPrisma();
    return prisma.roomType.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { basePrice: 'asc' },
    });
  }

  async createType(
    input: {
      name: string;
      description?: string;
      basePrice: string;
      maxGuests: number;
      amenities?: string[];
    },
    userId: string,
  ) {
    const prisma = getPrisma();
    const existing = await prisma.roomType.findFirst({ where: { name: input.name } });
    if (existing) throw new AppError('ROOM_TYPE_EXISTS', `Room type "${input.name}" exists`, 409);

    const record = await prisma.roomType.create({
      data: {
        name: input.name,
        description: input.description,
        basePrice: input.basePrice,
        maxGuests: input.maxGuests,
        amenities: input.amenities ? JSON.stringify(input.amenities) : null,
      },
    });
    await this.audit.log({
      userId,
      action: 'ROOM_TYPE_CREATE',
      entityType: 'RoomType',
      entityId: record.id,
      entityRef: record.name,
    });
    return record;
  }

  async updateStatus(id: string, status: string, userId: string) {
    const prisma = getPrisma();
    if (!VALID_STATUSES.includes(status)) {
      throw new AppError('INVALID_ROOM_STATUS', `Invalid room status: ${status}`, 400);
    }
    const room = await prisma.room.findFirst({ where: { id, deletedAt: null } });
    if (!room) throw new AppError('ROOM_NOT_FOUND', 'Room not found', 404);

    if (status === 'AVAILABLE' && room.status === 'OCCUPIED') {
      const activeStay = await prisma.booking.findFirst({
        where: { roomId: id, status: 'CHECKED_IN', deletedAt: null },
      });
      if (activeStay) {
        throw new AppError('ROOM_OCCUPIED', 'Room has an active stay. Check out first.', 409);
      }
    }

    const updated = await prisma.room.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId,
      action: 'ROOM_STATUS_CHANGE',
      entityType: 'Room',
      entityId: id,
      entityRef: updated.number,
      details: { from: room.status, to: status },
    });
    return updated;
  }
}
