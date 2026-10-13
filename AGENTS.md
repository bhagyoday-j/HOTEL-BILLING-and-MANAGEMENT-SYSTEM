# Agents

Current project overview and working conventions for agents and developers. This document describes
the code that is present today; older hotel-management modules in the Prisma schema are not
necessarily exposed by the current API or UI.

## Project

**Hotel Billing & Management System** — an offline-capable Windows desktop application for menu
management, customer billing, receipt printing, and owner analytics.

- **Version:** 1.0.0
- **Target:** Windows 10/11 x64 (Electron)
- **Local-first:** The desktop app uses a local Express API and SQLite database. Online sync is out
  of scope.

## Current architecture

```text
Electron main
  ├─ secure IPC + preload bridge (contextIsolation enabled)
  ├─ local server lifecycle, AppData paths, backup and printing
  └─ typed bridge: window.api.*
       ↓
React renderer (Vite; UI only, no Node/fs/db access)
  ├─ Zustand auth state (sessionStorage in browser)
  └─ HTTP http://127.0.0.1:3847 in browser / IPC in Electron
       ↓
Express local API
  ├─ routes + Zod request validation
  ├─ domain services + server-side permission checks
  └─ Prisma + SQLite
```

Business rules belong in server services. Renderer code must use the API service or the typed
Electron bridge; it must never access Node, the filesystem, or Prisma directly.

## Technology and package map

| Layer | Technology |
|---|---|
| Desktop shell | Electron 28 |
| Renderer | React 19, TypeScript, Vite |
| UI | Tailwind CSS 4, Radix UI |
| State | TanStack Query, Zustand |
| API | Express 4, Zod, Pino |
| Database | Prisma 5, SQLite |
| Authentication | Argon2, in-memory API sessions |
| Money | Shared billing engine using Decimal.js; do not calculate money with binary floats |

```text
apps/desktop/electron/       Electron main, IPC, server, backup, printing
apps/desktop/renderer/       React application, pages, components, API client
apps/server/                 Express API, routes and domain services
packages/shared/             shared types, roles/permissions and billing engine
prisma/                      schema, migrations and seed data
docs/                        architecture/deployment notes
```

## Current product scope

### Roles and permissions

The current role model has exactly two roles:

- `ADMIN` (owner): all current permissions.
- `MANAGER`: `MENU_VIEW`, `MENU_MANAGE`, `BILL_VIEW`, `BILL_CREATE`.

Protected API routes enforce permissions server-side. Renderer navigation and protected route
wrappers also gate access, but UI checks are not a substitute for server authorization.

### Menu

- List/search active categories and menu items.
- Create categories and items; update item details/availability; archive items using soft delete.
- A menu item has a category, name, optional SKU/description, price, tax rate and availability.
- Existing bills store snapshots and must not be rewritten by later menu edits.

### Bills

- List, search, inspect and cancel bills.
- Create a bill from selected menu items. Server re-reads current prices and tax rates, calculates
  totals using the shared billing engine, and finalizes the new bill as `PAID`.
- A client request ID provides duplicate-submit idempotency.
- Cancellation preserves the financial record and reason; it does not delete the bill.

### Dashboard and analytics

- Dashboard: today’s bill count/revenue and recent bills. Owner financial totals are nullable for
  non-owner roles.
- Owner-only analytics: date range, revenue/bill totals, average bill, revenue series, best sellers,
  and recent bills.
- Analytics are sales revenue, not profit; item costs are not tracked.

### Printing and desktop runtime

- Electron printing supports A4, 80mm and 58mm templates, printer discovery, invoice printing, and
  saving an HTML invoice copy.
- The physical print path is implemented but must be tested on a Windows machine with a printer.
- `npm run dev` starts the API and renderer. `npm run dev:electron` compiles the Electron TypeScript
  and starts the desktop shell. The renderer must already be available at port 5173 for dev mode.
- The Electron package entry is `apps/desktop/electron/dist/main.js`; compile Electron before launch.

### Hotel profile, settings, backups

The server/IPC contains hotel, settings, and backup operations, and the renderer Settings and
Manager-accounts pages implement them. Settings covers the hotel profile, billing/tax defaults and
the backup schedule; its backups panel creates and restores local copies in the desktop app.

## Current API surface

Base URL: `http://127.0.0.1:3847`. Protected HTTP routes use `Authorization: Bearer <token>`.
Health is public.

| Group | Routes | Access |
|---|---|---|
| Health | `GET /api/health` | Public |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout` | Login/logout |
| Dashboard | `GET /api/dashboard/summary` | Authenticated |
| Menu | `GET /api/menu`, `POST /api/menu/categories`, `POST /api/menu/items`, `PUT /api/menu/items/:id`, `DELETE /api/menu/items/:id` | `MENU_VIEW` / `MENU_MANAGE` |
| Bills | `GET /api/bills`, `GET /api/bills/:id`, `POST /api/bills`, `POST /api/bills/:id/cancel` | `BILL_VIEW` / `BILL_CREATE` / `BILL_CANCEL` |
| Analytics | `GET /api/analytics/summary` | `ANALYTICS_VIEW` (owner) |
| Managers | `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` | `MANAGER_MANAGE` (owner) |
| Hotel | `GET /api/hotel`, `GET /api/hotel/settings` | Authenticated |
| Settings | `GET/PUT /api/settings`, `PUT /api/settings/hotel` | Read authenticated; writes require `SETTINGS_MANAGE` |
| System | Current system/backup endpoints | See `apps/server/src/routes/system.ts` and Electron IPC |

**Important:** the Prisma schema retains legacy entities, but the current Express app no longer
mounts the former rooms, guests, bookings, restaurant-order, invoice/payment, expenses, cash-session,
search, reports, or audit-log routes. Their old renderer code must not be treated as working product
features. Reintroduce those flows only as a separately scoped implementation, including server routes,
services, permissions and tests.

## Development environment

- Development database: `prisma/dev.db` (typically configured by `DATABASE_URL` in `.env`).
- Production database: `%APPDATA%\Hotel Billing\data\hotel.db`.
- Local API: `http://127.0.0.1:3847`.
- Vite renderer: `http://127.0.0.1:5173`.
- Local seed accounts currently include `admin / Admin@123` and `manager / Manager@123`. These are
  development-only credentials; never use them in production.

## Setup, run, and validate

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://127.0.0.1:5173`; verify `http://127.0.0.1:3847/api/health`.
For the desktop shell, keep `npm run dev` running in one terminal and run
`npm run dev:electron` in another.

Validation commands:

```powershell
npm test
npm run typecheck
npm run build:renderer
npm run build:electron
```

`npm run typecheck` checks the renderer, server, and Electron projects using their individual
TypeScript configurations. The root `tsconfig.json` is a legacy aggregate config and should not be
invoked directly with `tsc -b`; it includes renderer/Vite code under incompatible CommonJS settings.
Do not run database reset/seed commands against a production or user database.

## Work completed and verified

- Fixed Electron's package entry to the compiled main file and updated `dev:electron` to compile
  Electron TypeScript before launching.
- Fixed browser API auth headers to read the live Zustand auth token. Auth state is in
  `sessionStorage`, allowing reload within the same tab. An `UNAUTHENTICATED` response now clears
  stale auth state and returns protected routes to login.
- Aligned current renderer navigation, page permissions, dashboard, menu, bills and analytics with
  the current API. Added menu category/item CRUD, bill creation/list/detail/cancellation, and
  receipt/A4 print actions.
- Removed stale global-search commands for endpoints not mounted by the current server.
- Replaced old room/guest/booking/expense/cash/audit renderer screens with explicit Phase 2
  placeholders so they do not call removed APIs.
- Live API checks: admin can access dashboard, menu, bills, analytics, manager accounts and
  settings; manager can access dashboard/menu/bills and receives 403 for analytics, manager accounts
  and settings.
- Live menu test: create/update/soft-delete succeeded. Temporary test records were archived.
  Current role configuration allows managers to manage menu items.
- Browser checks: manager login survives page reload; manager sees only permitted navigation and
  direct Analytics/Managers access is denied. Revoking the manager session then reloading clears
  the stale token and returns the browser to login.
- Implemented the renderer Settings page (hotel profile, billing/tax defaults, backup schedule and
  a desktop-only backups panel) and the Manager-accounts page (list, create, edit,
  activate/deactivate, archive). Verified the exact page payloads against the live API: profile and
  settings saves succeed, and a temporary manager was created, edited, deactivated and archived.
- Fixed analytics week grouping so empty week buckets are included, matching the day and month
  series. Verified `groupBy=week` returns the full range of weeks, and `day`/`month` bucket counts
  stay correct.
- Added unit tests for the invoice/thermal HTML templates (A4/80mm/58mm page size, HTML escaping,
  conditional tax and rounding rows), covering the receipt/print-preview document path without a
  physical printer.
- Verified printer discovery through the app's real call (`webContents.getPrintersAsync()`): it
  returned the installed printers on this Windows machine (`Microsoft Print to PDF` default,
  `OneNote (Desktop)`).
- Rendered the real invoice templates through Electron's print pipeline (`printToPDF`) and produced
  valid PDFs for A4, 80mm and 58mm output.
- Split the renderer build into vendor chunks (`vendor-react`, `vendor-ui`, `vendor-state`, `vendor`);
  the bundle chunk-size warning is gone and every chunk is under 500 kB. Verified the split build
  still mounts (login page rendered in headless Chrome).
- Browser bill flow: created, inspected, and cancelled temporary bill `INV-2026-000003`;
  cancellation remains in development history by design and is excluded from revenue analytics.
- Electron dev launch remained running without the previous missing-`main.js` startup error.
- `npm run typecheck` passed for renderer, server, and Electron after splitting checks by each
  app's TypeScript configuration.
- `npm test` passed (9 tests: shared billing engine and invoice/thermal print templates).
- `npm run build:renderer` passed after the current renderer integration.

## Remaining work and known issues

Statuses below are current as of this document. Items marked **accepted** are deliberate decisions,
not open tasks; **verified** items are done and covered by a check.

1. **Printing — verified as far as hardware allows.** Printer discovery works, the invoice/thermal
   templates are unit-tested, and the real templates render through Electron's print pipeline to
   valid PDFs (A4/80mm/58mm). Physical output on receipt paper still needs a real printer attached;
   print it once on the target Windows machine before shipping.
2. **Legacy pages — accepted, out of scope.** Room, guest, booking, restaurant order/KOT, expense,
   cash-session and audit workflows are not in the current server scope and remain Phase 2
   placeholders. Reintroducing any of them requires a separately scoped full-stack implementation
   (routes, services, permissions, validation and tests) per working rule 5.
3. **Analytics — verified.** Date grouping includes empty week/day/month buckets. Figures are sales
   revenue only; profit must not be displayed until item-cost data exists.
4. **Dependency audit — accepted, upgrade deferred.** `npm audit` reports 32 findings (3 critical,
   20 high, 9 moderate), mostly transitive dev/build tooling (`electron-builder`, `vitest`, `vite`,
   `tailwindcss`, `postcss`) plus `shadcn-ui`; the direct runtime ones are `argon2` and `electron`.
   Every available fix is a semver-major upgrade, so this was reviewed and deliberately deferred. Do
   not run `npm audit fix --force` without assessing breaking changes first.
5. **Vite bundle warning — resolved.** The renderer build splits vendor chunks in
   `apps/desktop/renderer/vite.config.ts`, so no chunk exceeds 500 kB.

## Working rules

1. Money calculations use the shared Decimal billing engine; do not use JavaScript floating-point
   arithmetic for financial totals.
2. Enforce all permissions on the server and mirror them in the UI.
3. Keep financial writes transactional and retain cancelled bills for history.
4. Preserve the existing SQLite database. Never reset/delete user data to make a test pass.
5. Do not restore a legacy UI/API module unless implementing its complete route/service/permission/
   validation flow and tests.
6. Password hashes and PIN hashes must not appear in logs.

## Future sync (not in current scope)

Desktop → Local SQLite → Sync Service → Cloud API → PostgreSQL.
