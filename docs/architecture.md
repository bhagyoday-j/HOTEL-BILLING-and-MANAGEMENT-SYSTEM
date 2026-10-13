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
4. Invoice/order/payment numbers come from the `Sequence` table.
5. Production DB path is AppData; source tree DB is for development only.

## Package map

| Package | Responsibility |
|---------|----------------|
| `apps/desktop/electron` | Main process, IPC, printers, backup hooks |
| `apps/desktop/renderer` | React UI |
| `apps/server` | Local API + business services |
| `packages/shared` | Types, RBAC maps, billing calculations |
| `prisma` | Schema, migrations, seed |

## Future sync (not in v1)

Desktop → Local SQLite → Sync Service → Cloud API → PostgreSQL
