import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { logger } from './logger';

/**
 * The app ships without the Prisma CLI, so migrations are applied by reading the
 * bundled `prisma/migrations/*\/migration.sql` files and executing their statements.
 * `_prisma_migrations` is kept compatible with Prisma's own bookkeeping table
 * (same columns, sha256 checksums) so a later `prisma migrate deploy` recognises
 * what this runner already applied.
 */
const MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "checksum" TEXT NOT NULL,
  "finished_at" DATETIME,
  "migration_name" TEXT NOT NULL,
  "logs" TEXT,
  "rolled_back_at" DATETIME,
  "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

/**
 * Split a migration file into individual statements.
 *
 * SQLite (through Prisma's `$executeRawUnsafe`) rejects multi-statement strings, so the
 * file has to be split by hand — while ignoring semicolons that appear inside string
 * literals, quoted identifiers and comments.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  const flush = (): void => {
    const statement = current.trim();
    if (statement) statements.push(statement);
    current = '';
  };

  while (i < sql.length) {
    const ch = sql[i];

    // Line comment
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }

    // Block comment
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    // Quoted literal or identifier: copy verbatim, a doubled quote is an escape.
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < sql.length) {
        const inner = sql[i];
        current += inner;
        i += 1;
        if (inner === quote) {
          if (sql[i] === quote) {
            current += quote;
            i += 1;
          } else {
            break;
          }
        }
      }
      continue;
    }

    if (ch === ';') {
      flush();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  flush();
  return statements;
}

/** Locate the migrations folder: explicit env override, packaged resources, then repo. */
export function resolveMigrationsDir(): string | null {
  // `resourcesPath` only exists when this runs inside Electron; the API can also be
  // started directly with Node (npm run dev), where the type is absent too.
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;

  const candidates = [
    process.env.PRISMA_MIGRATIONS_DIR,
    resourcesPath ? path.join(resourcesPath, 'prisma', 'migrations') : undefined,
    path.resolve(__dirname, '../../../..', 'prisma', 'migrations'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

interface MigrationFile {
  name: string;
  file: string;
}

function listMigrations(dir: string): MigrationFile[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, file: path.join(dir, entry.name, 'migration.sql') }))
    .filter((migration) => fs.existsSync(migration.file))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Apply every migration that has not been applied to this database yet.
 * Returns the names of the migrations applied by this call.
 */
export async function applyPendingMigrations(prisma: PrismaClient): Promise<string[]> {
  const dir = resolveMigrationsDir();
  if (!dir) {
    logger.warn('No migrations directory found; assuming the database is provisioned');
    return [];
  }

  await prisma.$executeRawUnsafe(MIGRATIONS_TABLE_SQL);

  const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string; checksum: string }>>(
    `SELECT "migration_name", "checksum" FROM "_prisma_migrations"
     WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
  );
  const applied = new Map(rows.map((row) => [row.migration_name, row.checksum]));

  const appliedNow: string[] = [];
  for (const migration of listMigrations(dir)) {
    const sql = fs.readFileSync(migration.file, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');

    if (applied.has(migration.name)) {
      if (applied.get(migration.name) !== checksum) {
        logger.warn(
          { migration: migration.name },
          'Applied migration differs from the bundled file; leaving the database untouched',
        );
      }
      continue;
    }

    const statements = splitSqlStatements(sql);
    logger.info({ migration: migration.name, statements: statements.length }, 'Applying migration');
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "_prisma_migrations"
        ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      randomUUID(),
      checksum,
      new Date().toISOString(),
      migration.name,
      'applied on application startup',
      new Date().toISOString(),
      statements.length,
    );

    appliedNow.push(migration.name);
  }

  return appliedNow;
}
