# Hotel Billing & Management System

Offline-capable Windows desktop application for **menu management, customer billing, receipt
printing, and owner analytics**.

**Version:** 1.0.0 · **Target:** Windows 10/11 x64 (Electron) · **Local-first:** the desktop app
runs a local Express API against a SQLite database. Online sync is out of scope.

## Overview

- **Menu management** — list/search categories and items; create categories and items; update
  details/availability; archive items with soft delete.
- **Tables & table billing** — create tables one at a time or bulk-create T1…Tn from a table
  count. Each table keeps its own running bill, so items and totals never mix between tables.
  Generate a separate paid bill per table when the customer finishes dining, or void the running
  bill and free the table.
- **Customer billing** — create a bill from selected menu items. The server re-reads current prices
  and tax rates, calculates totals with the shared billing engine, and finalizes the bill as
  `PAID`. A client request ID makes duplicate submits idempotent.
- **Bills** — list, search, inspect and cancel bills. Cancelling preserves the financial record and
  reason; it never deletes the bill.
- **Dashboard & analytics** — today's bill count/revenue and recent bills; owner-only analytics with
  date range, revenue/bill totals, average bill, revenue series, monthly revenue for the last 12
  months, best-selling items, best-selling days and recent bills.
- **Printing** — A4, 80mm and 58mm templates, printer discovery, invoice printing, and saved HTML
  invoice copies.
- **Hotel profile, settings & backups** — hotel details, billing/tax defaults, backup schedule, and
  local create/restore of database backups.

Analytics are **sales revenue**, not profit — item costs and expenses are not tracked.

## Tech stack

Electron 28 · React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Radix UI · TanStack Query ·
Zustand · React Router · Express 4 · Zod · Pino · Prisma 5 · SQLite · Argon2 · Decimal.js ·
electron-builder

## Architecture

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

Business rules live in server services. The renderer uses the API service or the typed Electron
bridge and never accesses Node, the filesystem, or Prisma directly. Money math uses the shared
`Decimal.js` billing engine — never binary floats.

## Repository layout

```text
apps/
  desktop/
    electron/     Electron main, IPC, server lifecycle, backup, printing
    renderer/     React application, pages, components, API client
  server/         Express API, routes and domain services
packages/shared/  Shared types, roles/permissions and billing engine
prisma/           Schema, migrations and seed data
docs/             Architecture, database, printing, backup, security, deployment
```

## Prerequisites

- **Node.js 20+**
- **npm 10+**
- **Windows 10/11 x64** (target platform)
- SQLite is bundled with Prisma — no separate install.

## Setup

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

## Running

Development runs the API and renderer together:

```powershell
npm run dev
```

This starts:

1. Local Express API on `http://127.0.0.1:3847`
2. Vite renderer on `http://127.0.0.1:5173`

Open `http://127.0.0.1:5173` and verify `http://127.0.0.1:3847/api/health`.

**Desktop (Electron) shell:** `npm run dev` does **not** launch Electron. Start it separately:

```powershell
# Terminal 1
npm run dev
# Terminal 2 (renderer must already be available on port 5173)
npm run dev:electron
```

`npm run dev:electron` compiles the Electron TypeScript first, then launches the shell (package
entry: `apps/desktop/electron/dist/main.js`).

## Development credentials

These are development-only seed accounts from `npm run db:seed`. **Never use them in production** —
the installed app creates its own owner account through first-run setup instead.

| Username | Password | Role |
|----------|----------|------|
| `admin` | `Admin@123` | ADMIN |
| `manager` | `Manager@123` | MANAGER |

The seed normalizes accounts to the two-role model: any legacy account (reception, cashier, etc.)
is reassigned to `MANAGER` rather than deleted, so old logins may still work as managers.

## Roles and permissions

The role model has exactly two roles:

- **ADMIN** (owner): all current permissions.
- **MANAGER**: `MENU_VIEW`, `MENU_MANAGE`, `BILL_VIEW`, `BILL_CREATE`.

Permissions are enforced server-side on every protected route; UI gating is a convenience only.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the API + Vite renderer |
| `npm run dev:server` | Start only the local Express API |
| `npm run dev:renderer` | Start only the Vite renderer |
| `npm run dev:electron` | Compile Electron TS and launch the desktop shell |
| `npm run build` | Compile shared, server, renderer and Electron |
| `npm run build:shared` | Compile `packages/shared` |
| `npm run build:server` | Compile the Express server |
| `npm run build:renderer` | Build the renderer (`vite build`) |
| `npm run build:electron` | Compile the Electron TypeScript |
| `npm run package` | Build + unpacked app in `release/win-unpacked` |
| `npm run installer` | Build + Windows installer `release/HotelBillingSetup.exe` |
| `npm test` | Vitest unit tests (billing engine + print templates) |
| `npm run typecheck` | Typecheck renderer, server and Electron separately |
| `npm run lint` | ESLint |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:migrate:deploy` | `prisma migrate deploy` |
| `npm run db:seed` | Seed roles, users, hotel, taxes, menu, sequences |
| `npm run db:studio` | Prisma Studio |

## Database

| Environment | Path |
|-------------|------|
| Development | `prisma/dev.db` (via `DATABASE_URL` in `.env`) |
| Production | `%APPDATA%\Hotel Billing\data\hotel.db` |

The Electron runtime also manages `data/`, `backups/`, `logs/` and `invoices/` under AppData.
Never store the production database inside the source tree.

### First run (installed app)

The packaged app has no database on a new machine, so it provisions one itself:

1. The bundled server applies the migrations in `prisma/migrations` to the AppData database on
   startup (no Prisma CLI required, and a no-op once they are applied).
2. If the installation has no owner account, the app shows a one-time setup screen where the owner
   enters the hotel name and chooses their own username and password. No default password is shipped.

Sign in afterwards with the owner account created there. The owner can change that password any time
in **Settings → Account & password** (manager passwords are reset from **Manager accounts**).

Prisma commands:

```bash
npx prisma migrate dev --name <name>
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Do **not** use `prisma db push` as the production migration strategy, and do not run database
reset/seed commands against a production or user database.

## Local API

Base URL `http://127.0.0.1:3847`. Protected HTTP routes use `Authorization: Bearer <token>`.
Health is public.

| Group | Routes | Access |
|-------|--------|--------|
| Health | `GET /api/health` | Public |
| Setup | `GET /api/setup/status`, `POST /api/setup` | Public, but `POST` only while no owner account exists |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/change-password` | Login/logout; change-password for the signed-in user |
| Dashboard | `GET /api/dashboard/summary` | Authenticated |
| Menu | `GET /api/menu`, `POST /api/menu/categories`, `POST /api/menu/items`, `PUT /api/menu/items/:id`, `DELETE /api/menu/items/:id` | `MENU_VIEW` / `MENU_MANAGE` |
| Tables | `GET /api/tables`, `GET /api/tables/:id`, `POST /api/tables`, `PUT/DELETE /api/tables/:id`, `POST /api/tables/bulk`, `POST /api/tables/:id/items`, `DELETE /api/tables/:id/items/:itemId`, `POST /api/tables/:id/checkout`, `POST /api/tables/:id/cancel` | `MENU_VIEW` / `MENU_MANAGE` / `BILL_VIEW` / `BILL_CREATE` |
| Bills | `GET /api/bills`, `GET /api/bills/:id`, `POST /api/bills`, `POST /api/bills/:id/cancel` | `BILL_VIEW` / `BILL_CREATE` / `BILL_CANCEL` |
| Analytics | `GET /api/analytics/summary` | `ANALYTICS_VIEW` (owner) |
| Managers | `GET /api/users`, `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` | `MANAGER_MANAGE` (owner) |
| Hotel | `GET /api/hotel`, `GET /api/hotel/settings` | Authenticated |
| Settings | `GET/PUT /api/settings`, `PUT /api/settings/hotel` | Read authenticated; writes require `SETTINGS_MANAGE` |
| System | system/backup endpoints | See `apps/server/src/routes/system.ts` and Electron IPC |

## Build & installer

Compile everything (shared, server, renderer, Electron):

```powershell
npm run build
```

Generate the Windows installer:

```powershell
npm run installer
```

`npm run installer` runs `npm run build` and then electron-builder, producing
`release/HotelBillingSetup.exe` (Windows x64 NSIS). For a faster unpacked build used during testing,
run `npm run package` → `release/win-unpacked`.

The installer preserves the AppData database, backups and logs across upgrades, and does not delete
user data on uninstall. The build is **unsigned**: `electron-builder.yml` sets
`win.signAndEditExecutable: false` so packaging works without a code-signing certificate (this also
avoids the symlink-privilege requirement of electron-builder's signing tools). Enable signing and
set it to `true` once a certificate is available.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Printing](docs/printing.md)
- [Backup](docs/backup.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)
- [Agent/project conventions](AGENTS.md)

## Current scope & known limitations

- **Current features** are menu, billing, dashboards/analytics, printing, manager accounts, hotel
  settings and backups. The Prisma schema retains legacy entities (rooms, guests, bookings,
  restaurant orders, expenses, cash sessions, audit), but the current API/UI does **not** expose
  them — their old renderer screens are Phase 2 placeholders and must not be treated as working.
- **Printing** is implemented (discovery, templates and the print pipeline are verified), but
  physical output on receipt paper must be confirmed once on the target Windows machine.
- **Dependency audit** findings are known; all fixes are semver-major and were deliberately
  deferred.
- Dates in analytics include empty week/day/month buckets; revenue only (no profit).

See [AGENTS.md](AGENTS.md) for the full remaining-work status.

## Troubleshooting

**API not reachable:** ensure `npm run dev:server` (or `npm run dev`) is running on port 3847. If the
port is already in use, stop the process holding it first.

**Prisma client missing:** run `npm run db:generate`.

**Argon2 build errors:** use Node 20 LTS and install Windows build tools if needed.

**Electron blank window:** confirm Vite is serving on 5173 and that the Electron TypeScript is
compiled (`npm run dev:electron` compiles it).
