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

### First run and database setup

A packaged install starts with no database, so the app provisions one itself (the installer ships no
Prisma CLI and no seeded credentials):

- The bundled server applies pending migrations from the packaged `prisma/migrations` on startup and
  records them in `_prisma_migrations` with Prisma-compatible checksums. Existing data is never
  dropped; applied migrations are skipped. This creates `%APPDATA%\Hotel Billing\data\hotel.db`.
- While no owner (ADMIN) account exists, `GET /api/setup/status` reports `required: true` and the
  renderer shows a one-time setup screen instead of the sign-in form. `POST /api/setup` creates the
  permission catalogue, both roles and their grants, the hotel profile with default settings, the
  default tax rows and the owner account in a single transaction. It answers `409` once an owner
  exists, so it cannot be used to add a second admin.
- No default password is shipped. The owner chooses their own during setup and can rotate it in
  **Settings → Account & password** (`POST /api/auth/change-password`).

### Menu

- List/search active categories and menu items.
- Create categories and items; update item details/availability; archive items using soft delete.
- A menu item has a category, name, optional SKU/description, price, tax rate and availability.
- Existing bills store snapshots and must not be rewritten by later menu edits.

### Tables and table bills

- Owner and manager can create, view, update and archive dining tables. Table numbers are unique;
  archiving a table keeps its number available for reuse.
- Bulk add creates `T1…Tn` from a single table count. Existing numbers are skipped (archived ones
  are restored), so entering 20 on a restaurant with T1–T6 adds T7–T20 and leaves the rest intact.
- Tables are listed in natural numeric order (`T2` before `T10`).
- Each table has at most one open running bill (an `OPEN` `RestaurantOrder`). Food items are added
  to that table's order only, with menu price/tax snapshotted when the item is ordered, so two
  tables never share items or totals.
- Adding the same item again merges it into the existing line. Each line has **+ / −** quantity
  controls that update the line and recalculate totals server-side; decrementing to zero removes
  the line. Individual lines can also be removed, and an unbilled running bill can be voided; any
  of these frees the table when no items remain.
- **Generate bill** snapshots the running order into a normal paid `Invoice` (via the shared billing
  engine), marks the order `BILLED` and frees the table. Repeated submits with the same client
  request ID return the same bill.
- A table with an open bill cannot be archived until the bill is generated or voided.
- The Tables page reuses the existing permissions: `MENU_VIEW` to view, `MENU_MANAGE` for table
  CRUD, and `BILL_VIEW` / `BILL_CREATE` for running bills and checkout.

### Bills

- List, search, inspect and cancel bills.
- Create a bill from selected menu items. Server re-reads current prices and tax rates, calculates
  totals using the shared billing engine, and finalizes the new bill as `PAID`.
- A client request ID provides duplicate-submit idempotency.
- Cancellation preserves the financial record and reason; it does not delete the bill.

### Customers

- A customer is derived from billing history — there is no separate table. A bill is matched to a
  customer by mobile (digits-only, 7+ digits) or, when no mobile is captured, by normalized name;
  anonymous walk-ins are excluded.
- `GET /api/customers` lists customers with visit counts and total spent; `GET /api/customers/lookup`
  returns one customer so the billing screen can show "returning customer, visited N times" while a
  bill is entered. Both owner and manager can view customers (`BILL_VIEW`).
- Visits count every bill (a cancelled bill still represents a visit); total spent excludes
  cancelled/draft/refunded bills so it matches analytics revenue.

### Dashboard and analytics

- Dashboard: today’s bill count/revenue and recent bills. Owner financial totals are nullable for
  non-owner roles.
- Owner-only analytics: date range, revenue/bill totals, average bill, revenue series, a fixed
  last-12-months revenue series, best-selling items, best-selling days (top revenue days in the
  selected range), and recent bills.
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
| Setup | `GET /api/setup/status`, `POST /api/setup` | Public; `POST` only while no owner account exists |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/change-password` | Login/logout; change-password for the signed-in user |
| Dashboard | `GET /api/dashboard/summary` | Authenticated |
| Menu | `GET /api/menu`, `POST /api/menu/categories`, `POST /api/menu/items`, `PUT /api/menu/items/:id`, `DELETE /api/menu/items/:id` | `MENU_VIEW` / `MENU_MANAGE` |
| Tables | `GET /api/tables`, `GET /api/tables/:id`, `POST /api/tables`, `PUT/DELETE /api/tables/:id`, `POST /api/tables/:id/items`, `POST /api/tables/bulk`, `PUT/DELETE /api/tables/:id/items/:itemId`, `POST /api/tables/:id/checkout`, `POST /api/tables/:id/cancel` | `MENU_VIEW` / `MENU_MANAGE` / `BILL_VIEW` / `BILL_CREATE` |
| Bills | `GET /api/bills`, `GET /api/bills/:id`, `POST /api/bills`, `POST /api/bills/:id/cancel` | `BILL_VIEW` / `BILL_CREATE` / `BILL_CANCEL` |
| Customers | `GET /api/customers`, `GET /api/customers/lookup` | `BILL_VIEW` |
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
npm run lint
npm run build
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
- Added a customer directory derived from bills: `GET /api/customers` and
  `GET /api/customers/lookup` (both `BILL_VIEW`, so owner and manager can use them), a Customers page
  listing visit counts, and an inline returning-customer lookup in Menu & Billing. Verified live:
  admin and manager both receive 200, unauthenticated requests receive 401, and a bill created with
  a customer mobile appears in the lookup with visit count 1. Added unit tests for the aggregation.
- Added unit tests for the invoice/thermal HTML templates (A4/80mm/58mm page size, HTML escaping,
  conditional tax and rounding rows), covering the receipt/print-preview document path without a
  physical printer.
- Verified printer discovery through the app's real call (`webContents.getPrintersAsync()`): it
  returned the installed printers on this Windows machine (`Microsoft Print to PDF` default,
  `OneNote (Desktop)`).
- Rendered the real invoice templates through Electron's print pipeline (`printToPDF`) and produced
  valid PDFs for A4, 80mm and 58mm output.
- Fixed the lint toolchain: `.eslintrc.cjs` contained JSON (invalid for a CommonJS file) and
  referenced plugins that were not installed. Converted the config to CommonJS, added the missing
  `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` and `eslint-plugin-react-hooks`
  devDependencies, and fixed the one reported error (`no-constant-condition` in
  `apps/server/src/utils/prisma.ts`). `npm run lint` now passes with no problems.
- Added an installer build path: `npm run build` now compiles shared, server, renderer and Electron
  (it previously skipped the server/shared dists the packager needs), and `npm run installer` runs
  that build then electron-builder to produce `release/HotelBillingSetup.exe` (`npm run package`
  produces an unpacked `release/win-unpacked`). Verified end-to-end. `electron-builder.yml` sets
  `win.signAndEditExecutable: false` so packaging works without a signing certificate and avoids
  electron-builder's `winCodeSign` symlink-privilege requirement.
- Added Tables & table bills: table CRUD, independent running orders per table, add/remove order
  items, void, and checkout into a separate paid invoice. Verified live against the dev API with
  admin and manager accounts: two tables kept separate totals, checking out one left the other's
  bill untouched, duplicate checkout returned the same bill, occupied tables refused deletion, and
  both roles completed the full flow. Added bulk table creation (`T1…Tn`, existing numbers
  skipped) and natural numeric table ordering. Added unit tests for table bill totals/tax split
  and natural table ordering.
- Added +/- quantity controls for items on a table's running bill. Quantity updates preserve the
  original price/tax snapshot, recalculate totals on the server, and removing the last unit frees
  the table. Verified the add/plus/minus/remove flow in the browser.
- Added analytics for monthly revenue (last 12 months) and best-selling days (top revenue days in
  the selected range), with the best day highlighted on the Analytics page. Revenue excludes
  cancelled bills. Added unit tests for month-window generation, monthly aggregation and
  best-day ranking/tie-breaking.
- Browser bill flow: created, inspected, and cancelled temporary bill `INV-2026-000003`;
  cancellation remains in development history by design and is excluded from revenue analytics.
- Electron dev launch remained running without the previous missing-`main.js` startup error.
- `npm run typecheck` passed for renderer, server, and Electron after splitting checks by each
  app's TypeScript configuration.
- `npm test` passed (9 tests: shared billing engine and invoice/thermal print templates).
- `npm run build:renderer` passed after the current renderer integration.
- **Fixed the installed app appearing not to start at all.** `startServer` only resolved from an
  8-second timer, and the child's `exit` handler cleared that timer without resolving — so when the
  API child died early the promise never settled, `bootstrap()` never reached `createMainWindow()`
  and the process ran with no window (double-clicking the app did nothing). `startServer` now always
  settles: it resolves as soon as `/api/health` answers, and also on child exit, spawn error or
  timeout. The window is created before the API starts, a window that is not ready in time is still
  shown, renderer load failures are logged and renderer console errors are written to the app log.
- **Fixed the packaged API dying on startup.** `prisma generate` writes the client to
  `node_modules/.prisma`, which the `node_modules/**/*` glob does not match, so the installed app
  failed with `Cannot find module '.prisma/client/default'`. The client is now copied into the
  package and unpacked from the asar along with `argon2` and Prisma's query engine (native binaries
  cannot load from inside an asar). `prisma/` is shipped as migrations + schema only, so the
  developer database (`prisma/dev.db`) is no longer bundled with the installer.
- **Fixed app paths.** Paths/logs are resolved from `%APPDATA%\<product name>` instead of Electron's
  pre-ready package name, and `userData` is pinned to the same folder. Previously the logger fell
  back to `<cwd>/.appdata`, which is not writable for an install under Program Files, and the
  database landed in `%APPDATA%\hotel-billing` rather than the documented path.
- **Added first-run setup and database initialization** (see *First run and database setup*): the
  packaged server applies its bundled migrations at startup, and an installation with no owner
  account shows a one-time setup screen where the owner sets the hotel name and their own username
  and password. No default credentials ship, and `/api/users` still refuses to modify ADMIN
  accounts, so `POST /api/auth/change-password` plus the Settings → Account panel were added for the
  signed-in user.
- Verified on the packaged build (`npm run package`, unpacked app): launching `Hotel Billing.exe`
  shows the main window (`tasklist /v` reports the "Hotel Billing" window, previously `N/A`), the
  bundled server applies both migrations (120 + 2 statements) to a brand-new database, the renderer
  bundle loads with no console errors, and the server chain was exercised end to end against that
  fresh database: setup status `required: true` → `POST /api/setup` → login (argon2 from the packaged
  asar) → dashboard/menu/hotel/settings → create a menu item and a bill (`INV-2026-000001`, subtotal
  80, tax 4.00, total 84.00) → customer lookup → duplicate `clientRequestId` returns the same bill →
  `change-password` (old password rejected, new accepted) → restart with setup no longer required and
  data intact. A second `POST /api/setup` returns `409`.
- Rendered the packaged renderer bundle with a stubbed bridge to confirm the UI: a fresh install
  routes to `#/setup` and renders the setup wizard, and an installation that already has an owner
  routes to `#/login`. Physical window behaviour on the target laptop still needs the owner of that
  machine to confirm.

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
