import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateStatus } from '@hotel-billing/shared';
import { logger } from '../security/logger';
import { applyUpdateEvent, createUpdateStatus, type UpdateEvent } from './updateState';

/** Delay the startup check so it never competes with booting the UI or the API. */
const STARTUP_CHECK_DELAY_MS = 5_000;

const supported =
  app.isPackaged &&
  process.platform === 'win32' &&
  process.env.NODE_ENV !== 'development';

let status: UpdateStatus = createUpdateStatus(app.getVersion(), supported);
let initialized = false;
let checking = false;
let installInProgress = false;

/**
 * electron-updater logs through its own logger interface. Route it into the app
 * log with a source tag instead of enabling electron-log or printing to stdout.
 */
const updaterLogger = {
  info: (message?: unknown) => logger.info({ source: 'updater' }, logText(message)),
  warn: (message?: unknown) => logger.warn({ source: 'updater' }, logText(message)),
  error: (message?: unknown) => logger.error({ source: 'updater' }, logText(message)),
  debug: (message?: unknown) => logger.debug({ source: 'updater' }, logText(message)),
};

function logText(message: unknown): string {
  if (typeof message === 'string') return message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function broadcast(next: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('updates:status', next);
    }
  }
}

function setStatus(event: UpdateEvent): UpdateStatus {
  status = applyUpdateEvent(status, event);
  broadcast(status);
  return status;
}

/** Avoid showing raw network/HTTP internals to the user; details stay in the log. */
function describeUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|net::|network/i.test(message)) {
    return 'Could not reach the update server. Check your internet connection and try again.';
  }
  if (/404|not found|No published versions/i.test(message)) {
    return 'No published update was found. Your current version keeps working.';
  }
  return 'The update could not be completed. Your current version keeps working.';
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function isUpdateInstallInProgress(): boolean {
  return installInProgress;
}

/**
 * Wire electron-updater events and schedule a non-blocking startup check.
 * Called from bootstrap after the window and local API are on their way.
 */
export function initUpdateService(): void {
  if (initialized) return;
  initialized = true;

  if (!supported) {
    logger.info(
      { packaged: app.isPackaged, platform: process.platform },
      'Update service disabled (only the installed Windows app checks for updates)',
    );
    return;
  }

  autoUpdater.logger = updaterLogger;
  autoUpdater.autoDownload = true;
  // Never install behind the user's back: a downloaded update waits until the
  // user explicitly chooses "Restart & install".
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  // This app ships a full NSIS installer, not an nsis-web installer.
  autoUpdater.disableWebInstaller = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info({ source: 'updater', phase: 'checking' }, 'Checking for updates');
    setStatus({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    logger.info({ source: 'updater', version: info.version }, 'Update available');
    setStatus({ type: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    logger.info({ source: 'updater' }, 'Application is up to date');
    setStatus({ type: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      type: 'progress',
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info({ source: 'updater', version: info.version }, 'Update downloaded');
    setStatus({ type: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (error) => {
    logger.warn({ source: 'updater', err: error }, 'Updater error');
    // If the installer could not start, allow a later retry instead of leaving
    // the UI stuck in "Restarting…". A real install already ends this process.
    installInProgress = false;
    setStatus({ type: 'error', message: describeUpdateError(error) });
  });

  const timer = setTimeout(() => {
    void checkForUpdates();
  }, STARTUP_CHECK_DELAY_MS);
  // The timer must never keep the app alive on its own.
  timer.unref?.();

  logger.info({ source: 'updater', currentVersion: status.currentVersion }, 'Update service ready');
}

/**
 * Check GitHub Releases for a newer version. Never throws: a failed check only
 * updates the status, so normal app use is unaffected.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!supported || checking) return status;
  if (status.phase === 'downloading' || status.phase === 'downloaded' || status.phase === 'installing') {
    return status;
  }

  checking = true;
  setStatus({ type: 'checking' });
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      setStatus({ type: 'not-available' });
    }
  } catch (error) {
    logger.warn({ source: 'updater', err: error }, 'Update check failed');
    // electron-updater also emits 'error'; only set it if no event already did.
    if (status.phase === 'checking') {
      setStatus({ type: 'error', message: describeUpdateError(error) });
    }
  } finally {
    checking = false;
  }

  return status;
}

/**
 * Hand over to the NSIS installer. This only spawns the installer and asks the
 * app to quit; the quit sequence (main.ts) then stops the local API and waits
 * for it before the process exits. If the installer cannot be launched, the
 * app stays fully functional.
 */
export function installUpdate(): void {
  if (status.phase !== 'downloaded') {
    throw new Error('No downloaded update is ready to install.');
  }
  if (installInProgress) return;

  installInProgress = true;
  setStatus({ type: 'installing' });
  logger.info({ source: 'updater', version: status.availableVersion }, 'Installing update and restarting');

  try {
    // Silent install, relaunch after installing. Windows will still apply its
    // normal UAC rules for a per-machine installation.
    autoUpdater.quitAndInstall(true, true);
  } catch (error) {
    installInProgress = false;
    logger.error({ source: 'updater', err: error }, 'Could not launch update installer');
    setStatus({ type: 'error', message: 'The update could not be started. Your current version keeps working.' });
    throw error;
  }
}
