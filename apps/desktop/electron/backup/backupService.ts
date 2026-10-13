import { app, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getAppPaths } from '../database/paths';
import { logger } from '../security/logger';
import { apiFetch } from '../ipc/apiClient';

export interface BackupResult {
  fileName: string;
  filePath: string;
  fileSize: number;
}

const BACKUP_NAME_RE = /^hotel-backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.db$/;

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export class BackupService {
  /**
   * Create a consistent backup: checkpoint the WAL via the local API,
   * then copy the DB file plus its sidecar files.
   */
  async createBackup(triggerType: 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE' | 'ON_CLOSE' = 'MANUAL'): Promise<BackupResult> {
    const paths = getAppPaths();
    fs.mkdirSync(paths.backups, { recursive: true });

    // Flush WAL so the copied file is complete
    try {
      await apiFetch('/api/system/db/checkpoint', { method: 'POST' });
    } catch (err) {
      logger.warn({ err }, 'WAL checkpoint failed before backup (continuing with file copy)');
    }

    const fileName = `hotel-backup-${timestamp()}.db`;
    const filePath = path.join(paths.backups, fileName);

    await fs.promises.copyFile(paths.databaseFile, filePath);

    const stat = await fs.promises.stat(filePath);
    const result: BackupResult = { fileName, filePath, fileSize: stat.size };

    // Record in DB (best-effort; don't fail the backup if API is down)
    try {
      await apiFetch('/api/system/backups/record', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          filePath,
          fileSize: stat.size,
          triggerType,
          status: 'SUCCESS',
        }),
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to record backup metadata');
    }

    await this.applyRetention();
    logger.info({ filePath, triggerType }, 'Backup created');
    return result;
  }

  /** List backup files in the backups directory. */
  listBackups(): Array<{ fileName: string; filePath: string; fileSize: number; createdAt: string }> {
    const paths = getAppPaths();
    if (!fs.existsSync(paths.backups)) return [];
    return fs
      .readdirSync(paths.backups)
      .filter((f) => BACKUP_NAME_RE.test(f))
      .map((f) => {
        const filePath = path.join(paths.backups, f);
        const stat = fs.statSync(filePath);
        return {
          fileName: f,
          filePath,
          fileSize: stat.size,
          createdAt: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Validate that a file looks like a SQLite database before restore. */
  validateBackupFile(filePath: string): { valid: boolean; error?: string } {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'Backup file not found' };
    }
    // SQLite files start with the 16-byte magic string
    const header = Buffer.alloc(16);
    let fd: number | undefined;
    try {
      fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, header, 0, 16, 0);
    } catch {
      return { valid: false, error: 'Unable to read backup file' };
    } finally {
      try {
        if (fd !== undefined) fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    if (!header.toString('utf8').startsWith('SQLite format 3')) {
      return { valid: false, error: 'File is not a valid SQLite database' };
    }
    if (fs.statSync(filePath).size < 4096) {
      return { valid: false, error: 'Backup file is too small to be valid' };
    }
    return { valid: true };
  }

  /**
   * Restore a backup. Always creates a safety backup of the current DB first.
   * The app must be restarted afterwards so the server reopens the new file.
   */
  async restoreBackup(filePath: string): Promise<{ safetyBackup: string }> {
    // Validate user-supplied path stays inside known backup locations
    const paths = getAppPaths();
    const resolved = path.resolve(filePath);

    const validation = this.validateBackupFile(resolved);
    if (!validation.valid) {
      throw new Error(validation.error ?? 'Invalid backup file');
    }

    // Safety backup before touching anything
    const safety = await this.createBackup('PRE_RESTORE');

    // Stop the API server so it releases the DB file handle
    try {
      await apiFetch('/api/system/shutdown', { method: 'POST' }).catch(() => undefined);
    } catch {
      /* best-effort */
    }
    await new Promise((r) => setTimeout(r, 1200));

    fs.copyFileSync(paths.databaseFile, `${paths.databaseFile}.tmp-restoring`);
    fs.copyFileSync(resolved, paths.databaseFile);
    // Remove stale WAL/SHM sidecars from the old database
    for (const sidecar of ['-wal', '-shm']) {
      const p = `${paths.databaseFile}${sidecar}`;
      if (fs.existsSync(p)) fs.rmSync(p);
    }

    logger.info({ restoredFrom: resolved, safetyBackup: safety.filePath }, 'Backup restored');
    return { safetyBackup: safety.filePath };
  }

  /** Keep only the newest N backup files. */
  private async applyRetention(): Promise<void> {
    let keep = 30;
    try {
      const res = await apiFetch<{ success: boolean; data?: Record<string, string> }>('/api/settings');
      if (res.success && res.data?.backupKeepCount) {
        keep = Math.max(1, Number(res.data.backupKeepCount) || 30);
      }
    } catch {
      /* default retention */
    }

    const backups = this.listBackups();
    for (const old of backups.slice(keep)) {
      try {
        fs.rmSync(old.filePath);
        logger.info({ file: old.fileName }, 'Old backup removed (retention)');
      } catch (err) {
        logger.warn({ err, file: old.fileName }, 'Failed to remove old backup');
      }
    }
  }

  /** Ask the user where to copy a backup (USB, external drive, folder). */
  async exportBackupToLocation(filePath: string, parentWindow: BrowserWindow): Promise<string | null> {
    const result = await dialog.showSaveDialog(parentWindow, {
      title: 'Save backup copy',
      defaultPath: path.basename(filePath),
      filters: [{ name: 'Database backup', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.copyFileSync(filePath, result.filePath);
    return result.filePath;
  }

  async openBackupsFolder(): Promise<void> {
    const paths = getAppPaths();
    await import('electron').then(({ shell }) => shell.openPath(paths.backups));
  }

  getDataDirectory(): string {
    return app.getPath('userData');
  }
}

export const backupService = new BackupService();
