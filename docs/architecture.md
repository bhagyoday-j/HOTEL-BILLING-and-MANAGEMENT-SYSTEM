# Architecture

## Runtime topology

```
┌─────────────────────────────────────────────┐
│ Electron Main                               │
│  - Window management                        │
│  - Secure IPC                               │
│  - AppData paths / backups / printing       │
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

## Design rules

1. Money math lives only in `@hotel-billing/shared` billing engine (`Decimal.js`).
2. Permissions are enforced in server services, not only in the UI.
3. Financial writes use Prisma transactions.
4. Document numbers (currently invoices) come from the `Sequence` table.
5. Production DB path is AppData; source tree DB is for development only.

## Package map

| Package | Responsibility |
|---------|----------------|
| `apps/desktop/electron` | Main process, IPC, printers, backup hooks |
| `apps/desktop/renderer` | React UI |
| `apps/server` | Local API + business services |
| `packages/shared` | Types, RBAC maps, billing calculations |
| `prisma` | Schema, migrations, seed |

## Current scope

The running API and UI expose menu management, billing, dashboards/analytics, printing, manager
accounts, hotel settings and backups. Access is governed by two roles: `ADMIN` (all permissions)
and `MANAGER` (`MENU_VIEW`, `MENU_MANAGE`, `BILL_VIEW`, `BILL_CREATE`).

The Prisma schema also retains legacy entities (rooms, guests, bookings, restaurant orders,
expenses, cash sessions, and similar) that the current API/UI do **not** mount. Those screens are
Phase 2 placeholders and must not be treated as working features.

## Future sync (not in v1)

Desktop → Local SQLite → Sync Service → Cloud API → PostgreSQL
