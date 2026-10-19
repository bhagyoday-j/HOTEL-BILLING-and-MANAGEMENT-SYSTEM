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

  /**
   * Self-service password change for the signed-in user (any role). The current
   * password must be supplied, and every other session for that account is dropped.
   */
  async changePassword(
    userId: string,
    currentToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const prisma = getPrisma();
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'Account not found', 401);
    }

    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect', 401);
    }
    if (currentPassword === newPassword) {
      throw new AppError('PASSWORD_UNCHANGED', 'Choose a password you have not used before', 400);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await argon2.hash(newPassword) },
    });

    sessionStore.revokeAllExcept(user.id, currentToken);

    await this.audit.log({
      userId: user.id,
      action: 'PASSWORD_CHANGE',
      entityType: 'User',
      entityId: user.id,
      entityRef: user.username,
    });
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
