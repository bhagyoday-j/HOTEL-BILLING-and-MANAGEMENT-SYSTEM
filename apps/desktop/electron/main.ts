import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { ensureAppDirectories } from './database/paths';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc';
import { logger } from './security/logger';
import { startServer, stopServer } from './server/serverProcess';
import { startBackupScheduler, stopBackupScheduler, backupOnCloseIfConfigured } from './backup/backupScheduler';
import { APP_NAME } from '@hotel-billing/shared';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1366,
    minHeight: 768,
    title: APP_NAME,
    show: false,
    backgroundColor: '#f5f3ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));
  }

  return win;
}

async function bootstrap(): Promise<void> {
  app.setName(APP_NAME);
  const paths = ensureAppDirectories();
  logger.info({ paths }, 'Application data directories ready');

  // Point Prisma at AppData DB in production; keep .env path in development
  if (!isDev) {
    process.env.DATABASE_URL = `file:${paths.databaseFile.replace(/\\/g, '/')}`;
  }

  registerIpcHandlers(ipcMain);

  // Production: spawn the local API server as a child process
  if (!isDev) {
    try {
      await startServer();
    } catch (err) {
      logger.error({ err }, 'Local API failed to start');
    }
  }

  await startBackupScheduler();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.whenReady().then(() => {
  void bootstrap().catch((err) => {
    logger.error({ err }, 'Bootstrap failed');
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let quitting = false;

app.on('before-quit', (event) => {
  if (quitting) return;
  quitting = true;
  // Fire on-close backup without blocking quit for more than a few seconds
  void backupOnCloseIfConfigured()
    .catch(() => undefined)
    .finally(() => {
      stopBackupScheduler();
      unregisterIpcHandlers();
      stopServer();
      logger.info('Application quitting');
      app.quit();
    });
  event.preventDefault();
});
