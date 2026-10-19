import { randomBytes } from 'node:crypto';

export interface SessionRecord {
  token: string;
  userId: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Local, offline session store. Tokens never leave this machine and are
 * discarded when the API process restarts (users simply log in again).
 */
class SessionStore {
  private sessions = new Map<string, SessionRecord>();

  create(userId: string, username: string): SessionRecord {
    // Remove any previous sessions for this user (single active session per user)
    for (const [token, rec] of this.sessions) {
      if (rec.userId === userId) this.sessions.delete(token);
    }
    const token = randomBytes(32).toString('base64url');
    const record: SessionRecord = {
      token,
      userId,
      username,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    this.sessions.set(token, record);
    return record;
  }

  get(token: string | undefined | null): SessionRecord | null {
    if (!token) return null;
    const rec = this.sessions.get(token);
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return rec;
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }

  revokeAllForUser(userId: string): void {
    for (const [token, rec] of this.sessions) {
      if (rec.userId === userId) this.sessions.delete(token);
    }
  }

  /**
   * Drop every session of a user except the one making the change — used after a
   * password change so the person who changed it stays signed in on this machine.
   */
  revokeAllExcept(userId: string, keepToken: string | undefined): void {
    for (const [token, rec] of this.sessions) {
      if (rec.userId === userId && token !== keepToken) this.sessions.delete(token);
    }
  }

  /** Drop expired entries; called opportunistically on each auth check. */
  sweep(): void {
    const now = Date.now();
    for (const [token, rec] of this.sessions) {
      if (rec.expiresAt < now) this.sessions.delete(token);
    }
  }
}

export const sessionStore = new SessionStore();
