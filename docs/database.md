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
