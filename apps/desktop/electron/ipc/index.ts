import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { APP_VERSION, fail, ok } from '@hotel-billing/shared';
import { getAppPaths } from '../database/paths';
import { logger } from '../security/logger';
import { apiFetch, apiFetchAuth, API_BASE } from './apiClient';
import { printerService } from '../printing/printerService';
import { backupService } from '../backup/backupService';
import { startBackupScheduler } from '../backup/backupScheduler';
import { hasServerCrashed, isServerRunning, startServer, stopServer } from '../server/serverProcess';

// Handlers receive untyped arg lists; each handler validates its own payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

const handlers = new Map<string, Handler>();

function handle(channel: string, fn: Handler): void {
  handlers.set(channel, fn);
  ipcMain.handle(channel, fn);
}

/**
 * Session token held by the main process after a successful login.
 * The renderer authenticates through this bridge; every passthrough call
 * carries the Bearer token so server-side RBAC applies uniformly.
 */
let sessionToken: string | undefined;

/** Run an authenticated API call, normalizing errors for the renderer. */
async function callApi<T>(
  _event: IpcMainInvokeEvent,
  path: string,
  init?: RequestInit,
): Promise<T | { success: false; error: { code: string; message: string } }> {
  try {
    return await apiFetchAuth<T>(path, sessionToken, init);
  } catch (err) {
    logger.error({ err, path }, 'API call failed');
    return fail('API_UNAVAILABLE', 'Local service is not reachable. Please restart the application.');
  }
}

function body(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value ?? {}) };
}

export function registerIpcHandlers(_ipc: IpcMain): void {
  // ─── App ──────────────────────────────────────────────────────
  handle('app:getVersion', () => APP_VERSION);
  handle('app:getPaths', () => getAppPaths());

  // ─── Auth ─────────────────────────────────────────────────────
  handle('auth:login', async (_event, payload: { username: string; password: string }) => {
    interface LoginBody {
      success: boolean;
      data?: { token?: string };
    }
    try {
      const res = await apiFetch<LoginBody>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res && 'success' in res && res.success) {
        sessionToken = res.data?.token;
      }
      return res;
    } catch {
      return fail('AUTH_UNAVAILABLE', 'Authentication service unavailable');
    }
  });
  handle('auth:changePassword', async (event, payload: { currentPassword: string; newPassword: string }) =>
    callApi(event, '/api/auth/change-password', body(payload ?? {})),
  );
  handle('auth:logout', async (_event, payload: { userId?: string }) => {
    try {
      return await apiFetchAuth('/api/auth/logout', sessionToken, {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      });
    } catch {
      return ok({ loggedOut: true });
    } finally {
      sessionToken = undefined;
    }
  });

  // ─── Generic typed passthrough (one channel per domain) ──────
  const passthrough = (
    channel: string,
    buildPath: (...args: unknown[]) => string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  ) => {
    handle(channel, async (event, ...args: unknown[]) => {
      // DELETE routes take their identifiers from the URL and ignore bodies;
      // POST/PUT bodies must be objects for Express' strict JSON parser.
      const payload = args[args.length - 1];
      const init: RequestInit | undefined =
        method === 'GET' || method === 'DELETE'
          ? undefined
          : {
              method,
              body: JSON.stringify(
                typeof payload === 'object' && payload !== null ? payload : {},
              ),
            };
      return callApi(event, buildPath(...args), init);
    });
  };

  // First-run setup (public: used before anyone can sign in)
  passthrough('setup:status', () => '/api/setup/status');
  passthrough('setup:complete', () => '/api/setup', 'POST');

  // Dashboard
  passthrough('dashboard:summary', () => '/api/dashboard/summary');

  // Menu
  passthrough('menu:list', (query: unknown) => `/api/menu${asQueryString(query)}`);
  passthrough('menu:createCategory', () => '/api/menu/categories', 'POST');
  passthrough('menu:createItem', () => '/api/menu/items', 'POST');
  passthrough('menu:updateItem', (id: unknown) => `/api/menu/items/${id}`, 'PUT');
  passthrough('menu:deleteItem', (id: unknown) => `/api/menu/items/${id}`, 'DELETE');

  // Tables & per-table running bills
  passthrough('tables:list', (query: unknown) => `/api/tables${asQueryString(query)}`);
  passthrough('tables:get', (id: unknown) => `/api/tables/${id}`);
  passthrough('tables:create', () => '/api/tables', 'POST');
  passthrough('tables:bulkCreate', () => '/api/tables/bulk', 'POST');
  passthrough('tables:update', (id: unknown) => `/api/tables/${id}`, 'PUT');
  passthrough('tables:remove', (id: unknown) => `/api/tables/${id}`, 'DELETE');
  passthrough('tables:addItems', (id: unknown) => `/api/tables/${id}/items`, 'POST');
  passthrough('tables:removeItem', (id: unknown, itemId: unknown) => `/api/tables/${id}/items/${itemId}`, 'DELETE');
  passthrough('tables:checkout', (id: unknown) => `/api/tables/${id}/checkout`, 'POST');
  passthrough('tables:cancel', (id: unknown) => `/api/tables/${id}/cancel`, 'POST');

  // Bills
  passthrough('bills:list', (query: unknown) => `/api/bills${asQueryString(query)}`);
  passthrough('bills:get', (id: unknown) => `/api/bills/${id}`);
  passthrough('bills:create', () => '/api/bills', 'POST');
  handle('bills:cancel', async (event, id: unknown, payload: { reason: string }) =>
    callApi(event, `/api/bills/${id}/cancel`, body(payload ?? {})),
  );

  // Customers (derived from bills)
  passthrough('customers:list', (query: unknown) => `/api/customers${asQueryString(query)}`);
  passthrough('customers:lookup', (query: unknown) => `/api/customers/lookup${asQueryString(query)}`);

  // Analytics
  passthrough('analytics:summary', (query: unknown) => `/api/analytics/summary${asQueryString(query)}`);

  // Manager accounts
  passthrough('users:list', () => '/api/users');
  passthrough('users:create', () => '/api/users', 'POST');
  passthrough('users:update', (id: unknown) => `/api/users/${id}`, 'PUT');
  passthrough('users:remove', (id: unknown) => `/api/users/${id}`, 'DELETE');

  // Hotel & settings
  passthrough('hotel:get', () => '/api/hotel');
  passthrough('hotel:getSettings', () => '/api/settings');
  passthrough('settings:updateHotel', () => '/api/settings/hotel', 'PUT');
  passthrough('settings:update', () => '/api/settings', 'PUT');

  // System
  passthrough('system:dbIntegrity', () => '/api/system/db/integrity');

  // ─── Printing ─────────────────────────────────────────────────
  handle('print:getPrinters', async () => {
    try {
      return ok(await printerService.getPrinters());
    } catch (err) {
      logger.error({ err }, 'print:getPrinters failed');
      return fail('PRINT_ERROR', 'Unable to list printers');
    }
  });

  handle('print:invoice', async (_event, payload: { data: unknown; format: string; printerName?: string; silent?: boolean; copies?: number }) => {
    try {
      const paths = getAppPaths();
      const data = payload.data as Parameters<typeof printerService.printInvoice>[0];
      await printerService.printInvoice(data, {
        format: payload.format as 'A4' | 'THERMAL_80' | 'THERMAL_58',
        printerName: payload.printerName,
        silent: payload.silent,
        copies: payload.copies,
      });
      await printerService
        .saveInvoiceCopy(data, payload.format as 'A4' | 'THERMAL_80' | 'THERMAL_58', paths.invoices)
        .catch(() => undefined);
      return ok({ printed: true });
    } catch (err) {
      logger.error({ err }, 'print:invoice failed');
      return fail('PRINT_ERROR', err instanceof Error ? err.message : 'Printing failed');
    }
  });

  handle('print:test', async (_event, payload: { printerName?: string }) => {
    try {
      await printerService.testPrint(payload?.printerName);
      return ok({ printed: true });
    } catch (err) {
      logger.error({ err }, 'print:test failed');
      return fail('PRINT_ERROR', err instanceof Error ? err.message : 'Test print failed');
    }
  });

  handle('print:savePdf', async (_event, payload: { data: unknown; format: string }) => {
    try {
      const paths = getAppPaths();
      const data = payload.data as Parameters<typeof printerService.saveInvoiceCopy>[0];
      const filePath = await printerService.saveInvoiceCopy(
        data,
        payload.format as 'A4' | 'THERMAL_80' | 'THERMAL_58',
        paths.invoices,
      );
      return ok({ filePath });
    } catch (err) {
      logger.error({ err }, 'print:savePdf failed');
      return fail('PRINT_ERROR', 'Could not save invoice copy');
    }
  });

  // ─── Backup & restore ─────────────────────────────────────────
  handle('backup:create', async () => {
    try {
      return ok(await backupService.createBackup('MANUAL'));
    } catch (err) {
      logger.error({ err }, 'backup:create failed');
      return fail('BACKUP_FAILED', err instanceof Error ? err.message : 'Backup failed');
    }
  });

  handle('backup:list', async () => ok(backupService.listBackups()));

  handle('backup:restore', async (event, payload: { filePath: string }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const confirm = await dialog.showMessageBox(win!, {
        type: 'warning',
        buttons: ['Cancel', 'Restore backup'],
        defaultId: 0,
        cancelId: 0,
        title: 'Restore backup',
        message: 'Restore this backup? The current database will be replaced.',
        detail: 'A safety backup of the current database is created first. The application will restart after restore.',
      });
      if (confirm.response !== 1) {
        return fail('RESTORE_CANCELLED', 'Restore cancelled');
      }
      const result = await backupService.restoreBackup(payload.filePath);
      return ok(result);
    } catch (err) {
      logger.error({ err }, 'backup:restore failed');
      return fail('RESTORE_FAILED', err instanceof Error ? err.message : 'Restore failed');
    }
  });

  handle('backup:validate', async (_event, payload: { filePath: string }) =>
    ok(backupService.validateBackupFile(payload.filePath)),
  );

  handle('backup:export', async (event, payload: { filePath: string }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const saved = await backupService.exportBackupToLocation(payload.filePath, win!);
      return saved ? ok({ savedTo: saved }) : fail('EXPORT_CANCELLED', 'Export cancelled');
    } catch (err) {
      logger.error({ err }, 'backup:export failed');
      return fail('BACKUP_FAILED', 'Could not export backup');
    }
  });

  handle('backup:openFolder', async () => {
    await backupService.openBackupsFolder();
    return ok({ opened: true });
  });

  // ─── Server control ───────────────────────────────────────────
  handle('server:status', () =>
    ok({ running: isServerRunning(), apiBase: API_BASE, crashed: hasServerCrashed() }),
  );
  handle('server:restart', async () => {
    stopServer();
    await startServer();
    return ok({ restarted: true });
  });

  // Settings watcher for backup scheduler refresh
  handle('settings:refreshScheduler', async () => {
    await startBackupScheduler();
    return ok({ refreshed: true });
  });

  // ─── External links ───────────────────────────────────────────
  handle('shell:openExternal', async (_event, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) {
      await shell.openExternal(url);
      return ok({ opened: true });
    }
    return fail('INVALID_URL', 'Only http(s) URLs can be opened');
  });

  logger.info({ version: APP_VERSION, userData: app.getPath('userData') }, 'IPC handlers registered');
}

export function unregisterIpcHandlers(): void {
  for (const channel of handlers.keys()) {
    ipcMain.removeHandler(channel);
  }
  handlers.clear();
}

/** Serialize query objects to a URL query string, skipping empty values. */
function asQueryString(query: unknown): string {
  if (typeof query !== 'object' || query === null) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

// Silence unused import warnings for types used only in signatures
export type { IpcMainEvent };
