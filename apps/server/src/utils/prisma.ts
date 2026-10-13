import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

let prisma: PrismaClient | null = null;

function findProjectRoot(startDir: string): string {
  let current = startDir;

  while (true) {
    if (fs.existsSync(path.join(current, 'prisma', 'schema.prisma'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

/**
 * Prisma CLI resolves `file:./dev.db` relative to the schema directory (prisma/).
 * The Node runtime resolves relative SQLite paths from process.cwd(), which is usually the
 * workspace folder (for example apps/server) rather than the repo root. Normalize to an
 * absolute path based on the actual project root before creating the client.
 */
export function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? 'file:./dev.db';
  if (!raw.startsWith('file:')) {
    return raw;
  }

  let filePath = raw.replace(/^file:/, '').trim();
  if ((filePath.startsWith('"') && filePath.endsWith('"')) || (filePath.startsWith("'") && filePath.endsWith("'"))) {
    filePath = filePath.slice(1, -1);
  }

  // Absolute Windows path e.g. C:/... or UNC / POSIX absolute
  if (/^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith('\\\\') || filePath.startsWith('/')) {
    return `file:${filePath.replace(/\\/g, '/')}`;
  }

  const projectRoot = findProjectRoot(process.cwd());
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const relativeCandidate = normalized.startsWith('prisma/') || normalized === 'prisma'
    ? normalized
    : path.join('prisma', normalized || 'dev.db');
  const absolute = path.resolve(projectRoot, relativeCandidate);
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
