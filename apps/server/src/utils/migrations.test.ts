import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { splitSqlStatements } from './migrations';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'prisma', 'migrations');

function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(MIGRATIONS_DIR, entry.name, 'migration.sql'))
    .filter((file) => fs.existsSync(file))
    .sort();
}

describe('splitSqlStatements', () => {
  it('splits statements on semicolons and drops comments', () => {
    const statements = splitSqlStatements(`
      -- CreateTable
      CREATE TABLE "A" ("id" TEXT NOT NULL);

      /* block
         comment */
      CREATE INDEX "A_id_idx" ON "A"("id");
    `);

    expect(statements).toEqual([
      'CREATE TABLE "A" ("id" TEXT NOT NULL)',
      'CREATE INDEX "A_id_idx" ON "A"("id")',
    ]);
  });

  it('does not split on a semicolon inside a string literal', () => {
    const statements = splitSqlStatements(
      `INSERT INTO "HotelSetting" ("value") VALUES ('open 9am; close 11pm'); CREATE INDEX "x" ON "y"("z");`,
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'open 9am; close 11pm'");
  });

  it('handles escaped quotes and quoted identifiers with semicolons', () => {
    const statements = splitSqlStatements(
      `INSERT INTO "T" ("name") VALUES ('it''s; fine'); CREATE TABLE "odd;name" ("id" TEXT);`,
    );

    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("'it''s; fine'");
    expect(statements[1]).toContain('"odd;name"');
  });

  it('ignores semicolons inside line and block comments', () => {
    const statements = splitSqlStatements('CREATE TABLE "A" ("id" TEXT); -- trailing; comment\n');
    expect(statements).toEqual(['CREATE TABLE "A" ("id" TEXT)']);
  });

  it('returns nothing for input without statements', () => {
    expect(splitSqlStatements('')).toEqual([]);
    expect(splitSqlStatements('   \n -- only a comment\n')).toEqual([]);
    expect(splitSqlStatements(';;')).toEqual([]);
  });
});

describe('bundled migrations', () => {
  it('splits every migration file into complete statements', () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      const statements = splitSqlStatements(sql);
      const semicolons = (sql.match(/;/g) ?? []).length;

      expect(statements.length).toBe(semicolons);
      expect(statements.length).toBeGreaterThan(0);

      for (const statement of statements) {
        expect(statement).not.toMatch(/;$/);
        expect(statement).toMatch(/^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|PRAGMA)\b/i);
      }
    }
  });

  it('creates every table declared in the init migration', () => {
    const init = migrationFiles()[0];
    const sql = fs.readFileSync(init, 'utf8');
    const statements = splitSqlStatements(sql);

    const declared = (sql.match(/CREATE TABLE/gi) ?? []).length;
    const created = statements.filter((s) => /^CREATE TABLE/i.test(s)).length;

    expect(declared).toBeGreaterThan(10);
    expect(created).toBe(declared);
  });

  it('keeps the invoice idempotency migration as two statements', () => {
    const latest = migrationFiles().at(-1)!;
    expect(splitSqlStatements(fs.readFileSync(latest, 'utf8'))).toEqual([
      'ALTER TABLE "Invoice" ADD COLUMN "clientRequestId" TEXT',
      'CREATE UNIQUE INDEX "Invoice_clientRequestId_key" ON "Invoice"("clientRequestId")',
    ]);
  });
});
