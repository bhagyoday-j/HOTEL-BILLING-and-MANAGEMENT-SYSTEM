# Agents

Project overview, architecture, and working conventions for agents and developers.

## Project

**Hotel Billing & Management System** — a production-oriented, offline-first Windows desktop
application for hotel front-office, restaurant POS, invoicing, and reporting.

- **Version:** 1.0.0 (Phase 1 foundation)
- **Target:** Windows 10/11 x64 (Electron)
- **Offline-first:** Core operations must not require internet. Optional online sync is out of scope
  for v1.

## Runtime topology

```text
┌─────────────────────────────────────────────┐
│ Electron Main                               │
│  - Window management / secure IPC           │
│  - AppData paths, backups, printing         │
│  - contextIsolation + preload bridge        │
└───────────────┬─────────────────────────────┘
                │ typed IPC (window.api.*)
┌───────────────▼─────────────────────────────┐
│ React Renderer                              │
│  - UI only                                  │
│  - TanStack Query + Zustand                 │
│  - No fs / db / Node access                 │
└───────────────┬─────────────────────────────┘
                │ HTTP 127.0.0.1:3847 (local)
┌───────────────▼─────────────────────────────┐
│ Express Local API                           │
│  - Controllers / routes                     │
│  - Domain services                          │
│  - Zod validation                           │
│  - Prisma + SQLite                          │
└─────────────────────────────────────────────┘
```

- Renderer never touches Node/fs/db directly.
- The Electron main process uses `contextIsolation` and a typed IPC bridge.
- Business logic lives in server services, not in routes or UI.

## Tech stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron 28 |
| UI | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 + Radix UI primitives (dialog, dropdown, label, slot, toast) |
| State | TanStack Query 4/5 + Zustand 4 + persist |
| API | Express 4 + CORS + Pino |
| DB | SQLite via Prisma 5 |
| Validation | Zod |
| Auth | Argon2 + session token store + audit log |
| Money | `Decimal.js` (shared billing engine), no JS floats |
| Build | Tsc + electron-builder (NSIS installer) |

## Package map

```
hotel-billing/
├── apps/
│   ├── desktop/              # Electron main + React renderer
│   │   ├── electron/         # main.ts, ipc/, printing/, backup/, server/, database/
│   │   └── renderer/         # React app, pages, components, services
│   └── server/               # Local Express API + domain services + routes
├── packages/
│   └── shared/               # Shared types, permissions, billing engine
├── prisma/                   # Schema, migrations, seed
└── docs/                     # Architecture & ops docs
```

## Core modules

### Auth
- Argon2 password hashing (never floats), optional cashier PIN hash.
- Failed login tracking + temporary lockout (5 attempts / 15 min).
- Audit log for LOGIN / LOGOUT.
- Session store is local + in-memory: tokens are discarded when the API process restarts.
- `/api/auth/login`, `/api/auth/pin-login`, `/api/auth/logout`.

### Rooms
- Room statuses: `AVAILABLE`, `OCCUPIED`, `RESERVED`, `CLEANING`, `MAINTENANCE`, `BLOCKED`.
- Business rules: no manual occupancy edits (only check-in/out), no editing checked-in stays,
  no archiving an occupied room, no booking an overlapping stay.
- Room grid and room-type management.

### Bookings
- Statuses: `CONFIRMED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`, `NO_SHOW`.
- Check-in/out, cancel, folio (room charges + unpaid room-service orders), invoice generation.
- Overlap prevention enforced in a database transaction.

### Restaurant / POS
- Menu (categories + items), restaurant tables, orders (`DINE_IN`, `TAKEAWAY`, `ROOM_SERVICE`).
- Order lifecycles: `DRAFT` → `HELD` → `SENT` → `PREPARING` → `READY` → `COMPLETED`, or
  `CANCELLED`.
- Pay-and-close flow creates an invoice + payments; KOT print is available per order.

### Invoices & payments
- Statuses: `DRAFT`, `ISSUED`, `PAID`, `PARTIALLY_PAID`, `CANCELLED`, `REFUNDED`.
- Line items, split taxes (CGST/SGST/IGST), payments, cancellations (never delete — financial
  history stays intact).

### Cash sessions
- Open/close shift sessions, live drawer reconciliation (`expectedCash`), closing differences.

### Reports
- Sales summary, revenue by day, payments by method, top menu items, occupancy, outstanding dues,
  GST summary, guest report, expense report, cancelled invoices.

### Users & RBAC
- Roles: `ADMIN`, `MANAGER`, `RECEPTIONIST`, `CASHIER`, `RESTAURANT_STAFF`, `VIEWER`.
- Permission set includes `DASHBOARD_VIEW`, `ROOM_*`, `GUEST_*`, `BOOKING_*`, `RESTAURANT_*`,
  `INVOICE_*`, `PAYMENT_CREATE`, `REPORT_VIEW`, `EXPENSE_CREATE`, `USER_MANAGE`,
  `SETTINGS_MANAGE`, `BACKUP_CREATE`, `BACKUP_RESTORE`, `AUDIT_LOG_VIEW`.
- Permissions are enforced in server services, not only in the UI.

### Audit
- `AuditLog` table records `userId`, `action`, `entityType`, `entityId`, `entityRef`,
  `details` (JSON string).
- Actions include user changes, financial writes, check-in/out, tax setting changes, and more.

### Hotel & settings
- Hotel profile (name, address, GSTIN, PAN) and a key-value settings store for tax rates,
  numbering prefixes, backup scheduler, theme, and checkout room status.

### Backup & restore
- Manual + scheduled backups, safety backup before restore, WAL checkpoint, integrity validation,
  retention (default keep last 30). Backup filename: `hotel-backup-YYYY-MM-DD-HH-mm-ss.db`.
- `ON_CLOSE` scheduler hook on app quit.

### Printing
- A4 / 80mm / 58mm templates, invoice + KOT + receipt, silent print + preview, per-purpose
  printers (`INVOICE`, `RECEIPT`, `KOT`). IPC surface: `window.api.print.*`.

## API surface

Base: `http://127.0.0.1:3847`. Authentication is Bearer token carried in the `Authorization`
header (plus session cookie in some clients).

| Group | Prefix | Notes |
|-------|--------|-------|
| Health | `/api/health` | Status + version + offline capability |
| Auth | `/api/auth` | Login, PIN login, logout |
| Rooms | `/api/rooms` | List, grid, types, CRUD, status, delete |
| Hotel | `/api/hotel`, `/api/settings` | Profile + key-value settings |
| Dashboard | `/api/dashboard/summary` | Live front-office metrics |
| Guests | `/api/guests` | CRUD, search, archive |
| Bookings | `/api/bookings` | CRUD, cancel, check-in, check-out, folio |
| Restaurant | `/api/restaurant` | Menu, tables, orders, pay |
| Invoices | `/api/invoices` | List, get, create, payments, cancel |
| Expenses | `/api/expenses` | Categories, list, record |
| Cash sessions | `/api/cash-sessions` | Current, summary, open, close, list |
| Reports | `/api/reports` | 11 report endpoints |
| Search | `/api/search` | Global guest/invoice/booking/room/order/payment search |
| Users | `/api/users` | List, roles, CRUD, roles |
| Audit logs | `/api/audit-logs` | List paginated |
| Settings | `/api/settings` | Full settings + save |
| System | `/api/system` | Backups, DB checkpoint/integrity, shutdown, server status |

Every protected route goes through `requireAuth` and, where needed, `requirePermission(...)`.
Server-side RBAC is enforced here — hiding buttons in the frontend is a convenience only.

## Data model (key entities)

User, Role, Permission, Hotel, HotelSetting, RoomType, Room, Guest, Booking, BookingGuest,
MenuCategory, MenuItem, RestaurantTable, RestaurantOrder, RestaurantOrderItem, Invoice,
InvoiceItem, Payment, Tax, Discount, Expense, ExpenseCategory, CashSession, AuditLog,
PrinterSetting, BackupRecord, Notification, Sequence, DailyClosing.

Money columns use Prisma `Decimal`. Never use JS floating point for billing calculations.

## Dev environment

- Development database: `prisma/dev.db` (via `DATABASE_URL` in `.env`).
- Production database: `%APPDATA%\Hotel Billing\data\hotel.db` (Electron resolves at startup; the
  source-tree DB is dev-only).
- Local API: `http://127.0.0.1:3847`. Renderer: Vite on `http://127.0.0.1:5173`.
- Development credentials (change before production):

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | ADMIN |
| manager | Manager@123 | MANAGER |
| reception | Reception@123 | RECEPTIONIST |
| cashier | Cashier@123 | CASHIER (PIN: 1234) |
| restaurant | Restaurant@123 | RESTAURANT_STAFF |
| viewer | Viewer@123 | VIEWER |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Electron + API + Vite (concurrently) |
| `npm run dev:server` | Start the local Express API only |
| `npm run build` | Build all packages |
| `npm run build:renderer` / `build:electron` | Renderer / main separately |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | TypeScript project references |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:migrate:deploy` | Prisma migrate (production) |
| `npm run db:seed` | Seed roles, rooms, menu, users |
| `npm run db:studio` | Prisma Studio |
| `npm run package` | electron-builder dir output |
| `npm run installer` | `release/HotelBillingSetup.exe` |

## Build / installer

- `npm run installer` → `release/HotelBillingSetup.exe`.
- NSIS Windows x64 installer; desktop + Start Menu shortcuts; preserves AppData DB/backups/logs
  on upgrade; does not delete user data on uninstall.
- Production checklist: change seed passwords, configure hotel GSTIN/tax rates, configure
  printers, enable automatic backups, verify A4 + thermal print templates, run
  `prisma migrate deploy` against the AppData DB path, smoke-test check-in → POS → checkout →
  invoice → backup.

## Design rules

1. Money math lives only in `@hotel-billing/shared` billing engine (`Decimal.js`).
2. Permissions are enforced in server services, not only in the UI.
3. Financial writes use Prisma transactions.
4. Invoice/order/payment numbers come from the `Sequence` table (transaction-safe).
5. Production DB path is AppData; source-tree DB is for development only.
6. Backup restore requires confirmation (Phase 10).
7. Password hashes and PIN hashes are redacted from all logs (Pino redaction).

## Future sync (not in v1)

Desktop → Local SQLite → Sync Service → Cloud API → PostgreSQL.
