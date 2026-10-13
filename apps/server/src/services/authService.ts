import * as argon2 from 'argon2';
import type { SessionUser } from '@hotel-billing/shared';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { sessionStore } from './sessionStore';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export class AuthService {
  private audit = new AuditService();

  async login(username: string, password: string): Promise<{ user: SessionUser; token: string }> {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('ACCOUNT_LOCKED', 'Account temporarily locked. Try again later.', 423);
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      const failedLogins = user.failedLogins + 1;
      const lockedUntil =
        failedLogins >= MAX_FAILED_LOGINS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
          : null;

      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins, lockedUntil },
      });

      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      entityRef: user.username,
    });

    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleCode: user.role.code,
      permissions: user.role.permissions.map((rp) => rp.permission.code),
    };

    const session = sessionStore.create(user.id, user.username);

    return { user: sessionUser, token: session.token };
  }

  async pinLogin(username: string, pin: string): Promise<{ user: SessionUser; token: string }> {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.pinHash) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid PIN credentials', 401);
    }

    const valid = await argon2.verify(user.pinHash, pin);
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid PIN credentials', 401);
    }

    await this.audit.log({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      entityRef: `${user.username}:PIN`,
    });

    const session = sessionStore.create(user.id, user.username);

    return {
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roleCode: user.role.code,
        permissions: user.role.permissions.map((rp) => rp.permission.code),
      },
      token: session.token,
    };
  }

  async logout(userId?: string, token?: string): Promise<void> {
    if (token) sessionStore.revoke(token);
    if (userId) {
      sessionStore.revokeAllForUser(userId);
      await this.audit.log({
        userId,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: userId,
      });
    }
  }
}
