# Backup & Restore

Implemented in the Electron main process (`apps/desktop/electron/backup`).

## Capabilities

- Manual and scheduled backups.
- A safety backup is always created before a restore.
- SQLite header validation before restoring.
- Configurable retention (`backupKeepCount`, default 30).
- Export a backup copy to an external location (USB, external drive, folder).
- Open the backups folder.

## Create flow

1. Checkpoint the SQLite WAL through the local API.
2. Copy the database file into the backups directory.
3. Record backup metadata through the API (best-effort).
4. Apply retention (keep the newest N files).

## Restore flow

1. Validate the selected file (must be a SQLite database, minimum size).
2. Create a safety backup of the current database.
3. Stop the local API so it releases the DB handle.
4. Replace the database file and remove stale `-wal` / `-shm` sidecars.
5. Restart the application to reopen the restored database.

## Location & naming

Backups live in the AppData backups directory. Filename format:

`hotel-backup-YYYY-MM-DD-HH-mm-ss.db`

## IPC surface

- `window.api.backup.create()`
- `window.api.backup.list()`
- `window.api.backup.restore(filePath)`
- `window.api.backup.validate(filePath)`
- `window.api.backup.export(filePath)`
- `window.api.backup.openFolder()`

## Settings

- `backupFrequency`: `NEVER` | `DAILY` | `EVERY_6_HOURS` | `EVERY_12_HOURS` | `ON_CLOSE`
- `backupKeepCount`: number of backups to keep

Both are edited from the renderer Settings page.
