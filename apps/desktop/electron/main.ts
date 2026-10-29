import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { ensureAppDirectories, getAppPaths } from './database/paths';
import { registerIpcHandlers, unregisterIpcHandlers } from './ipc';
import { logger } from './security/logger';
import { startServer, stopServer, stopServerAndWait } from './server/serverProcess';
import { startBackupScheduler, stopBackupScheduler, backupOnCloseIfConfigured } from './backup/backupScheduler';
import { initUpdateService, isUpdateInstallInProgress } from './updater/updateService';
import { APP_NAME } from '@hotel-billing/shared';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Chromium data and every app path (logs, database, backups, invoices) must live in the
 * same AppData folder. Electron resolves `userData` from the package name before the app
 * is ready, so set it explicitly here: otherwise windows/logs landed in
 * `%APPDATA%\hotel-billing`, and the logger fell back to a `<cwd>/.appdata` folder that
 * may not even be writable (e.g. an install under Program Files).
 */
app.setName(APP_NAME);
app.setPath('userData', getAppPaths().root);

/** How long to wait for the renderer before showing the window regardless. */
const WINDOW_REVEAL_FALLBACK_MS = 10_000;

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

  const reveal = (reason: string): void => {
    if (win.isDestroyed() || win.isVisible()) return;
    logger.info({ reason }, 'Showing main window');
    win.show();
  };

  win.once('ready-to-show', () => reveal('ready-to-show'));
  // A window that never becomes ready must still be shown, otherwise the app looks
  // like it did not launch at all.
  const revealTimer = setTimeout(() => reveal('reveal-timeout'), WINDOW_REVEAL_FALLBACK_MS);
  win.once('closed', () => clearTimeout(revealTimer));

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    logger.error({ code, description, url }, 'Renderer failed to load');
    reveal('did-fail-load');
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error({ details }, 'Renderer process gone');
    reveal('render-process-gone');
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error({ preloadPath, err: error }, 'Preload script failed');
  });
  // Surface renderer errors in the same log file, otherwise a broken UI looks like
  // nothing happening at all.
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) logger.error({ message, line, sourceId }, 'Renderer console');
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win
      .loadFile(path.join(__dirname, '../../renderer/dist/index.html'))
      .catch((err) => logger.error({ err }, 'Renderer load failed'));
  }

  return win;
}

async function bootstrap(): Promise<void> {
  const paths = ensureAppDirectories();
  logger.info({ paths }, 'Application data directories ready');

  // Point Prisma at AppData DB in production; keep .env path in development
  if (!isDev) {
    process.env.DATABASE_URL = `file:${paths.databaseFile.replace(/\\/g, '/')}`;
  }

  registerIpcHandlers(ipcMain);

  // Create the window first: the local API can take a moment to boot (it applies
  // database migrations on first run) and a problem there must never stop the UI
  // from appearing.
  createMainWindow();

  // Update checks run independently of startup: this schedules a delayed check
  // and returns immediately, so a slow or offline network never delays the UI.
  initUpdateService();

  await startBackupScheduler();

  // Production: spawn the local API server as a child process
  if (!isDev) {
    try {
      await startServer();
    } catch (err) {
      logger.error({ err }, 'Local API failed to start');
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}

app.whenReady().then(() => {
  void bootstrap().catch((err) => {
    logger.error({ err }, 'Bootstrap failed');
    // Never fail silently — a quit with no window looks like the app did not start.
    dialog.showErrorBox(
      `${APP_NAME} could not start`,
      `${err instanceof Error ? err.message : String(err)}\n\nLog file: ${getAppPaths().logs}`,
    );
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
  const installingUpdate = isUpdateInstallInProgress();
  // Skip the on-close backup while an installer is taking over: the database
  // must not be copied mid-update. Stop the local API and wait for it to exit so
  // the installer replaces files only after the server has released them.
  // Otherwise fire the backup without blocking quit for more than a few seconds.
  void (installingUpdate ? stopServerAndWait(5_000) : backupOnCloseIfConfigured())
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
