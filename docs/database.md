# Database

## Engine

SQLite + Prisma ORM with WAL mode recommended for concurrent local reads.

## Location

| Environment | Path |
|-------------|------|
| Development | `prisma/dev.db` (`DATABASE_URL` in `.env`) |
| Production | `%APPDATA%\Hotel Billing\data\hotel.db` |

## Models

**Used by the current API/UI:**

User, Role, Permission, RolePermission, Hotel, HotelSetting, MenuCategory, MenuItem, Invoice,
InvoiceItem, Sequence, AuditLog, Tax, BackupRecord

**Legacy (retained in the schema, not exposed by the current API/UI):**

RoomType, Room, Guest, Booking, BookingGuest, RestaurantTable, RestaurantOrder,
RestaurantOrderItem, Payment, Discount, Expense, ExpenseCategory, CashSession, PrinterSetting,
Notification, DailyClosing

Bills snapshot item names, prices and tax rates onto `InvoiceItem`, so later menu edits never
rewrite financial history.

## Money

All currency columns use Prisma `Decimal`. Never use JS floating point for billing calculations.

## Migrations

- Dev: `prisma migrate dev`
- Prod: `prisma migrate deploy`
- Never auto-destroy production data
- Do not use `db push` in production

### Applied on startup in the packaged app

The installer does not ship the Prisma CLI, so the bundled server applies pending migrations itself
when it starts (`apps/server/src/utils/migrations.ts`). It reads the migration folder shipped as an
extra resource, splits each `migration.sql` into statements, executes them and records the result in
`_prisma_migrations` with Prisma-compatible names and sha256 checksums. Running `prisma migrate
deploy` against the same database later therefore sees those migrations as already applied.

This is what creates `%APPDATA%\Hotel Billing\data\hotel.db` on a machine that has never run the
app. It never drops or rewrites existing data: applied migrations are skipped, and a migration whose
file no longer matches its recorded checksum is logged and left alone.

## First-run data

A migrated database is still empty — no roles, hotel or accounts — so nobody could sign in. Until an
owner (ADMIN) account exists, `GET /api/setup/status` reports `required: true` and the app shows the
one-time setup screen. `POST /api/setup` then creates, in one transaction: the permission catalogue,
the ADMIN/MANAGER roles with their grants, the hotel profile and its default settings (currency, tax
rates, invoice numbering, backup schedule), the default tax rows, and the owner account. It refuses
with `409 SETUP_ALREADY_COMPLETE` once an owner exists, so it cannot be used to add a second admin.
