import * as argon2 from 'argon2';
import { z } from 'zod';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { sessionStore } from './sessionStore';

/**
 * Manager-account management (admin only).
 * New accounts are always created with the MANAGER role; role codes are not
 * accepted from the API at all, so neither managers nor admins can escalate
 * privileges through user endpoints.
 */
export const createManagerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, dashes allowed'),
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateManagerSchema = createManagerSchema
  .partial()
  .omit({ password: true })
  .extend({
    password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
    isActive: z.boolean().optional(),
  });

export type CreateManagerInput = z.infer<typeof createManagerSchema>;
export type UpdateManagerInput = z.infer<typeof updateManagerSchema>;

export class UserService {
  private audit = new AuditService();

  async list() {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { deletedAt: null, role: { code: 'MANAGER' } },
      orderBy: { username: 'asc' },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  }

  async create(input: CreateManagerInput, userId: string) {
    const prisma = getPrisma();
    const dup = await prisma.user.findFirst({ where: { username: input.username } });
    if (dup) throw new AppError('USERNAME_EXISTS', 'Username already exists', 409);

    const managerRole = await prisma.role.findUnique({ where: { code: 'MANAGER' } });
    if (!managerRole) throw new AppError('ROLE_NOT_FOUND', 'MANAGER role is not configured', 500);

    const passwordHash = await argon2.hash(input.password);

    const user = await prisma.user.create({
      data: {
        username: input.username,
        fullName: input.fullName,
        email: input.email || null,
        phone: input.phone || null,
        roleId: managerRole.id,
        passwordHash,
      },
    });

    await this.audit.log({
      userId,
      action: 'MANAGER_CREATE',
      entityType: 'User',
      entityId: user.id,
      entityRef: user.username,
      details: { role: 'MANAGER' },
    });

    return { id: user.id, username: user.username };
  }

  async update(id: string, input: UpdateManagerInput, actorId: string) {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!existing) throw new AppError('USER_NOT_FOUND', 'Account not found', 404);
    if (existing.role.code !== 'MANAGER') {
      throw new AppError('FORBIDDEN', 'Only manager accounts can be modified here', 403);
    }
    if (input.isActive === false && id === actorId) {
      throw new AppError('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account', 400);
    }

    const data: Record<string, unknown> = {};
    if (input.username && input.username !== existing.username) {
      const dup = await prisma.user.findFirst({ where: { username: input.username } });
      if (dup) throw new AppError('USERNAME_EXISTS', 'Username already exists', 409);
      data.username = input.username;
    }
    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.email !== undefined) data.email = input.email || null;
    if (input.phone !== undefined) data.phone = input.phone || null;
    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
      if (!input.isActive) await sessionStore.revokeAllForUser(id); // deactivate → immediate lockout
    }
    if (input.password) {
      data.passwordHash = await argon2.hash(input.password);
      await sessionStore.revokeAllForUser(id); // password reset → invalidate sessions
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update', 400);
    }

    await prisma.user.update({ where: { id }, data });

    await this.audit.log({
      userId: actorId,
      action: 'MANAGER_UPDATE',
      entityType: 'User',
      entityId: id,
      entityRef: existing.username,
      details: {
        fields: Object.keys(data).filter((f) => f !== 'passwordHash'),
        passwordChanged: Boolean(input.password),
        deactivated: input.isActive === false,
      },
    });
  }

  /** Soft-delete; keeps audit references intact. */
  async remove(id: string, actorId: string) {
    const prisma = getPrisma();
    if (id === actorId) {
      throw new AppError('CANNOT_DELETE_SELF', 'You cannot delete your own account', 400);
    }
    const existing = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!existing) throw new AppError('USER_NOT_FOUND', 'Account not found', 404);
    if (existing.role.code !== 'MANAGER') {
      throw new AppError('FORBIDDEN', 'Only manager accounts can be deleted here', 403);
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await sessionStore.revokeAllForUser(id);

    await this.audit.log({
      userId: actorId,
      action: 'MANAGER_DELETE',
      entityType: 'User',
      entityId: id,
      entityRef: existing.username,
    });
  }
}
