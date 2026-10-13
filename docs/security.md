# Security

## Electron

- `contextIsolation: true`
- `nodeIntegration: false`
- Preload exposes only typed `window.api.*` methods
- No `fs`, `child_process`, or `require` in renderer

## Auth

- Argon2 password hashes
- Optional cashier PIN hash
- Failed login tracking + temporary lockout
- Audit log for LOGIN / LOGOUT

## Data

- Prisma parameterized queries
- Zod validation on API inputs
- Server-side RBAC (expanding in Phase 3)
- Passwords never logged (Pino redaction)

## Files

- AppData paths only for DB/backups/logs/invoices
- Backup restore requires confirmation (Phase 10)
