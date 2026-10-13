# Security

## Electron

- `contextIsolation: true`
- `nodeIntegration: false`
- Preload exposes only typed `window.api.*` methods
- No `fs`, `child_process`, or `require` in the renderer

## Authentication

- Argon2 password hashes
- In-memory API sessions (Bearer token)
- Failed-login tracking: **5** failed attempts lock the account for **15 minutes**
- Audit log for `LOGIN` / `LOGOUT`
- No PIN authentication — the legacy cashier-PIN flow was removed with the single-role model

## Authorization

- Exactly two roles: `ADMIN` (all permissions) and `MANAGER` (`MENU_VIEW`, `MENU_MANAGE`,
  `BILL_VIEW`, `BILL_CREATE`).
- Permissions are enforced **server-side** on every protected route; UI gating mirrors them but is
  not a substitute.
- Manager accounts: resetting a password or deactivating an account revokes all of that user's
  sessions immediately.

## Data

- Prisma parameterized queries
- Zod validation on API inputs
- Password hashes never logged (Pino redaction)

## Files

- AppData paths only for DB / backups / logs / invoices
- Backup restore requires explicit confirmation and creates a safety backup first
