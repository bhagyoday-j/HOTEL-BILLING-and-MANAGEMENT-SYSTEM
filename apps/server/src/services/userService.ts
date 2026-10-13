import * as argon2 from 'argon2';
import { z } from 'zod';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { sessionStore } from './sessionStore';
import { ROLES } from '@hotel-billing/shared';

export const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, dashes'),
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  roleCode: z.enum(ROLES),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  pin: z
    .string()
    .regex(/^\d{4,8}$/, 'PIN must be 4-8 digits')
    .optional()
    .or(z.literal('')),
});

export const updateUserSchema = createUserSchema
  .partial()
  .omit({ password: true })
  .extend({
    password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
    isActive: z.boolean().optional(),
  });

export class UserService {
  private audit = new AuditService();

  async list() {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { username: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      roleCode: u.role.code,
      roleName: u.role.name,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      hasPin: Boolean(u.pinHash),
    }));
  }

  async create(input: z.infer<typeof createUserSchema>, userId: string) {
    const prisma = getPrisma();
    const dup = await prisma.user.findFirst({ where: { username: input.username } });
    if (dup) throw new AppError('USERNAME_EXISTS', 'Username already exists', 409);

    const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
    if (!role) throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);

    const passwordHash = await argon2.hash(input.password);
    const pinHash = input.pin ? await argon2.hash(input.pin) : null;

    const user = await prisma.user.create({
      data: {
        username: input.username,
        fullName: input.fullName,
        email: input.email || null,
        phone: input.phone,
        roleId: role.id,
        passwordHash,
        pinHash,
      },
    });

    await this.audit.log({
      userId,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: user.id,
      entityRef: user.username,
      details: { role: input.roleCode },
    });

    return { id: user.id, username: user.username };
  }

  async update(id: string, input: z.infer<typeof updateUserSchema>, userId: string) {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    const data: Record<string, unknown> = {};
    if (input.username && input.username !== existing.username) {
      const dup = await prisma.user.findFirst({ where: { username: input.username } });
      if (dup) throw new AppError('USERNAME_EXISTS', 'Username already exists', 409);
      data.username = input.username;
    }
    if (input.fullName) data.fullName = input.fullName;
    if (input.email !== undefined) data.email = input.email || null;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      if (!input.isActive) sessionStore.revokeAllForUser(id);
    }
    if (input.roleCode) {
      const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
      if (!role) throw new AppError('ROLE_NOT_FOUND', 'Role not found', 404);
      data.roleId = role.id;
    }
    if (input.password) {
      data.passwordHash = await argon2.hash(input.password);
    }
    if (input.pin !== undefined) {
      data.pinHash = input.pin ? await argon2.hash(input.pin) : null;
    }

    await prisma.user.update({ where: { id }, data });
    await this.audit.log({
      userId,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: id,
      entityRef: existing.username,
    });
  }

  /** Soft-delete; keeps audit references intact. */
  async remove(id: string, userId: string) {
    const prisma = getPrisma();
    if (id === userId) {
      throw new AppError('CANNOT_DELETE_SELF', 'You cannot delete your own account', 400);
    }
    const existing = await prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError('USER_NOT_FOUND', 'User not found', 404);

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    sessionStore.revokeAllForUser(id);

    await this.audit.log({
      userId,
      action: 'USER_DELETE',
      entityType: 'User',
      entityId: id,
      entityRef: existing.username,
    });
  }

  async listRoles() {
    const prisma = getPrisma();
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { code: 'asc' },
    });
    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      permissions: r.permissions.map((rp) => rp.permission.code),
    }));
  }
}
