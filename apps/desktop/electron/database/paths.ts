import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME } from '@hotel-billing/shared';

export interface AppPaths {
  root: string;
  data: string;
  databaseFile: string;
  backups: string;
  logs: string;
  invoices: string;
}

/**
 * Resolve the AppData root from `appData` + APP_NAME rather than
 * `app.getPath('userData')`.
 *
 * This module is loaded through the logger while Electron is still starting up, and at
 * that point `userData` still reflects the package name (`hotel-billing`). The previous
 * readiness check replaced that with a `<cwd>/.appdata` fallback, which put the log file
 * next to the executable — a location that is not always writable (an install under
 * Program Files), failing startup before any window could be created.
 */
function resolveRoot(): string {
  try {
    return path.join(app.getPath('appData'), APP_NAME);
  } catch {
    const appData = process.env.APPDATA ?? process.env.HOME ?? process.cwd();
    return path.join(appData, APP_NAME);
  }
}

export function getAppPaths(): AppPaths {
  const root = resolveRoot();
  const data = path.join(root, 'data');
  return {
    root,
    data,
    databaseFile: path.join(data, 'hotel.db'),
    backups: path.join(root, 'backups'),
    logs: path.join(root, 'logs'),
    invoices: path.join(root, 'invoices'),
  };
}

export function ensureAppDirectories(): AppPaths {
  const paths = getAppPaths();
  for (const dir of [paths.root, paths.data, paths.backups, paths.logs, paths.invoices]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}
