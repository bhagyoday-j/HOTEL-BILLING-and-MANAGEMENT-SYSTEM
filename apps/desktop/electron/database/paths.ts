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

export function getAppPaths(): AppPaths {
  // In development Electron may not be ready; fall back to cwd-based path for tooling
  const userData =
    app && typeof app.isReady === 'function' && app.isReady()
      ? app.getPath('userData')
      : path.join(process.cwd(), '.appdata', APP_NAME.replace(/\s+/g, ''));

  const root = userData;
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
