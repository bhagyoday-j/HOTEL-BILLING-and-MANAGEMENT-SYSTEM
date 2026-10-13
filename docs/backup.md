# Backup & Restore

Implemented in Phase 10.

Requirements already designed into AppData layout:

- Manual + scheduled backups
- Safety backup before restore
- Integrity validation
- Configurable retention (default keep last 30)
- Recovery screen on DB startup failure

Backup filename format:

`hotel-backup-YYYY-MM-DD-HH-mm-ss.db`
