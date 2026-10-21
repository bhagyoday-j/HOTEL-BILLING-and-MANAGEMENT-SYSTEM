import { createHash, randomBytes } from 'node:crypto';
import { getPrisma } from '../utils/prisma';

export interface SessionRecord {
  token: string;
  userId: string;
  username: string;
  createdAt: number;
}

/**
 * Persistent sign-in sessions.
 *
 * Sessions live in SQLite rather than process memory, so signing in survives a
 * restart of the app (and of the local API process) — the user stays signed in
 * until they explicitly sign out. The bearer token itself is never stored: only
 * its SHA-256 hash, so a database copy cannot be used to impersonate a user.
 *
 * Password changes and account deactivation/archival still revoke sessions
 * immediately, and only one session per account is kept.
 */
export class SessionStore {
  async create(userId: string, username: string): Promise<SessionRecord> {
    const prisma = getPrisma();
    // Single active session per account, matching the previous behaviour.
    await prisma.authSession.deleteMany({ where: { userId } });

    const token = randomBytes(32).toString('base64url');
    const row = await prisma.authSession.create({
      data: { tokenHash: hashSessionToken(token), userId, username },
    });

    return {
      token,
      userId: row.userId,
      username: row.username,
      createdAt: row.createdAt.getTime(),
    };
  }

  async get(token: string | undefined | null): Promise<SessionRecord | null> {
    if (!token) return null;
    const row = await getPrisma().authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
    });
    if (!row) return null;
    return {
      token,
      userId: row.userId,
      username: row.username,
      createdAt: row.createdAt.getTime(),
    };
  }

  async revoke(token: string): Promise<void> {
    await getPrisma().authSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await getPrisma().authSession.deleteMany({ where: { userId } });
  }

  /**
   * Drop every session of a user except the one making the change — used after a
   * password change so the person who changed it stays signed in on this machine.
   */
  async revokeAllExcept(userId: string, keepToken: string | undefined): Promise<void> {
    if (!keepToken) {
      await this.revokeAllForUser(userId);
      return;
    }
    await getPrisma().authSession.deleteMany({
      where: { userId, tokenHash: { not: hashSessionToken(keepToken) } },
    });
  }
}

/** Tokens are stored hashed; the raw token only ever lives on the client. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export const sessionStore = new SessionStore();
