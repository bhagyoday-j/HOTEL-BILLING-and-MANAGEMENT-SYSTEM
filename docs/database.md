# Database

## Engine

SQLite + Prisma ORM with WAL mode recommended for concurrent local reads.

## Location

| Environment | Path |
|-------------|------|
| Development | `prisma/dev.db` (`DATABASE_URL` in `.env`) |
| Production | `%APPDATA%\Hotel Billing\data\hotel.db` |

## Models

User, Role, Permission, Hotel, HotelSetting, RoomType, Room, Guest, Booking, BookingGuest, MenuCategory, MenuItem, RestaurantTable, RestaurantOrder, RestaurantOrderItem, Invoice, InvoiceItem, Payment, Tax, Discount, Expense, ExpenseCategory, CashSession, AuditLog, PrinterSetting, BackupRecord, Notification, Sequence, DailyClosing

## Money

All currency columns use Prisma `Decimal`. Never use JS floating point for billing calculations.

## Migrations

- Dev: `prisma migrate dev`
- Prod: `prisma migrate deploy`
- Never auto-destroy production data
- Do not use `db push` in production
