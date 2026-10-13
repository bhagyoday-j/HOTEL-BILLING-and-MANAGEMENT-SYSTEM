# Hotel Billing & Management System

Production-oriented Windows desktop application for hotel front-office, restaurant POS, invoicing, and reporting.

**Version:** 1.0.0 (Phase 1 foundation)

## Overview

- **Offline-first** Electron desktop app (Windows x64)
- **Local SQLite** via Prisma (AppData in production)
- **React + TypeScript** UI with Tailwind
- **Express** local API + secure Electron IPC
- **Argon2** password hashing, RBAC permissions

## Tech stack

Electron · React · TypeScript · Vite · Express · SQLite · Prisma · Tailwind · Zod · React Hook Form · TanStack Query · Zustand · Recharts · Electron Builder · Pino · Argon2

## Architecture

```
hotel-billing/
├── apps/
│   ├── desktop/          # Electron main + React renderer
│   └── server/           # Local Express API + domain services
├── packages/shared/      # Shared types, permissions, billing engine
├── prisma/               # Schema, migrations, seed
└── docs/                 # Architecture & ops docs
```

Renderer never touches Node/fs/db directly. Main process uses `contextIsolation` and typed IPC. Business logic lives in server services.

## Prerequisites

- Node.js 20+
- Windows 10/11 x64 (target platform)
- npm 10+

## Installation

```bash
npm install
npm run db:migrate
npm run db:seed
```

## Development

```bash
npm run dev
```

This starts:

1. Local Express API on `http://127.0.0.1:3847`
2. Vite renderer on `http://127.0.0.1:5173`
3. Electron shell

You can also open the renderer in a browser at `http://127.0.0.1:5173` while the API is running.

## Development credentials (CHANGE BEFORE PRODUCTION)

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
| `npm run dev` | Run Electron + API + Vite |
| `npm run build` | Build all packages |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run typecheck` | TypeScript project references |
| `npm run db:migrate` | Prisma migrate (dev) |
| `npm run db:migrate:deploy` | Prisma migrate (production) |
| `npm run db:seed` | Seed roles, rooms, menu, users |
| `npm run db:studio` | Prisma Studio |
| `npm run package` | electron-builder dir output |
| `npm run installer` | Create `HotelBillingSetup.exe` |

## Database

Development DB: `prisma/dev.db` via `DATABASE_URL` in `.env`.

Production DB (resolved by Electron):

`%APPDATA%\Hotel Billing\data\hotel.db`

Also created on startup:

- `data/`
- `backups/`
- `logs/`
- `invoices/`

Never store the production database inside the source tree.

## Prisma

```bash
npx prisma migrate dev --name <name>
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Do **not** use `prisma db push` as the production migration strategy.

## Build / installer

```bash
npm run installer
```

Output: `release/HotelBillingSetup.exe`

Installer preserves user data, database, and backups across upgrades.

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [Printing](docs/printing.md)
- [Backup](docs/backup.md)
- [Security](docs/security.md)
- [Deployment](docs/deployment.md)

## Build phases

1. **Phase 1 (current):** Project setup, Electron shell, Prisma schema, auth login, dashboard shell, rooms grid
2. Phase 2–3: Schema hardening, full RBAC middleware
3. Phase 4: Hotel settings, guests, rooms CRUD
4. Phase 5: Bookings, check-in/out
5. Phase 6: Restaurant POS, tables, KOT
6. Phase 7: Billing engine wiring, invoices, payments, GST
7. Phase 8: Printing + PDF
8. Phase 9: Reports + exports
9. Phase 10: Backup/restore + audit UX
10. Phase 11–12: Tests, packaging polish, production docs

## Troubleshooting

**API not reachable:** ensure `npm run dev:server` is up on port 3847.

**Prisma client missing:** run `npx prisma generate`.

**Argon2 build errors:** install Windows build tools / use Node 20 LTS.

**Electron blank window:** wait for Vite on 5173; check `apps/desktop/electron/dist` was built.
