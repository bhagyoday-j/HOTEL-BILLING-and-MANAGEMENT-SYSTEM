import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

let prisma: PrismaClient | null = null;

/**
 * Prisma CLI resolves `file:./dev.db` relative to the schema directory (prisma/).
 * The Node runtime resolves relative SQLite paths from process.cwd().
 * Normalize to an absolute file URL before creating the client.
 */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (!raw.startsWith('file:')) {
    return raw;
  }

  const filePath = raw.replace(/^file:/, '');
  // Absolute Windows path e.g. C:/... or UNC / POSIX absolute
  if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\') || filePath.startsWith('/')) {
    return `file:${filePath.replace(/\\/g, '/')}`;
  }

  // Dev default: prisma/dev.db from repo root
  const absolute = path.resolve(process.cwd(), 'prisma', path.basename(filePath));
  return `file:${absolute.replace(/\\/g, '/')}`;
}

export function getPrisma(): PrismaClient {
  if (!prisma) {
    const url = resolveDatabaseUrl();
    process.env.DATABASE_URL = url;

    prisma = new PrismaClient({
      datasources: {
        db: { url },
      },
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
          : [{ emit: 'event', level: 'error' }],
    });

    prisma.$on('error' as never, (e: unknown) => {
      logger.error({ err: e }, 'Prisma error');
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
