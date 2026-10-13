import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { APP_VERSION, fail, ok } from '@hotel-billing/shared';
import { getAppPaths } from '../database/paths';
import { logger } from '../security/logger';
import { apiFetch, apiFetchAuth, API_BASE } from './apiClient';
import { printerService } from '../printing/printerService';
import { backupService } from '../backup/backupService';
import { startBackupScheduler } from '../backup/backupScheduler';
import { isServerRunning, startServer, stopServer } from '../server/serverProcess';

// Handlers receive untyped arg lists; each handler validates its own payload.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;

const handlers = new Map<string, Handler>();

function handle(channel: string, fn: Handler): void {
  handlers.set(channel, fn);
  ipcMain.handle(channel, fn);
}

/** Run an authenticated API call, normalizing errors for the renderer. */
async function callApi<T>(
  event: IpcMainInvokeEvent,
  path: string,
  init?: RequestInit,
): Promise<T | { success: false; error: { code: string; message: string } }> {
  const token = extractToken(event);
  try {
    return await apiFetchAuth<T>(path, token, init);
  } catch (err) {
    logger.error({ err, path }, 'API call failed');
    return fail('API_UNAVAILABLE', 'Local service is not reachable. Please restart the application.');
  }
}

function extractToken(event: IpcMainInvokeEvent): string | undefined {
  const token = (event.senderFrame ?? {}) as { authToken?: string };
  return token.authToken;
}

function body(value: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(value ?? {}) };
}

export function registerIpcHandlers(_ipc: IpcMain): void {
  // ─── App ──────────────────────────────────────────────────────
  handle('app:getVersion', () => APP_VERSION);
  handle('app:getPaths', () => getAppPaths());

  // ─── Auth ─────────────────────────────────────────────────────
  handle('auth:login', async (_event, payload: { username: string; password: string }) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }).catch(() =>
      fail('AUTH_UNAVAILABLE', 'Authentication service unavailable'),
    ),
  );
  handle('auth:pin-login', async (_event, payload: { username: string; pin: string }) =>
    apiFetch('/api/auth/pin-login', { method: 'POST', body: JSON.stringify(payload) }).catch(() =>
      fail('AUTH_UNAVAILABLE', 'Authentication service unavailable'),
    ),
  );
  handle('auth:logout', async (event, payload: { userId?: string }) => {
    const token = extractToken(event);
    return apiFetchAuth('/api/auth/logout', token, { method: 'POST', body: JSON.stringify(payload ?? {}) }).catch(
      () => ok({ loggedOut: true }),
    );
  });

  // ─── Generic typed passthrough (one channel per domain) ──────
  const passthrough = (
    channel: string,
    buildPath: (...args: unknown[]) => string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  ) => {
    handle(channel, async (event, ...args: unknown[]) => callApi(event, buildPath(...args), method === 'GET' ? undefined : body(args[args.length - 1])));
  };

  // Guests
  passthrough('guests:list', () => '/api/guests');
  passthrough('guests:create', () => '/api/guests', 'POST');
  passthrough('guests:get', (id: unknown) => `/api/guests/${id}`);
  passthrough('guests:update', (id: unknown) => `/api/guests/${id}`, 'PUT');
  passthrough('guests:remove', (id: unknown) => `/api/guests/${id}`, 'DELETE');
  passthrough('guests:search', (q: unknown) => `/api/guests/search?q=${encodeURIComponent(String(q ?? ''))}`);

  // Rooms
  passthrough('rooms:list', () => '/api/rooms');
  passthrough('rooms:grid', () => '/api/rooms/grid');
  passthrough('rooms:types', () => '/api/rooms/types');
  passthrough('rooms:createType', () => '/api/rooms/types', 'POST');
  passthrough('rooms:get', (id: unknown) => `/api/rooms/${id}`);
  passthrough('rooms:create', () => '/api/rooms', 'POST');
  passthrough('rooms:update', (id: unknown) => `/api/rooms/${id}`, 'PUT');
  passthrough('rooms:updateStatus', (id: unknown) => `/api/rooms/${id}/status`, 'PATCH');
  passthrough('rooms:remove', (id: unknown) => `/api/rooms/${id}`, 'DELETE');

  // Bookings
  passthrough('bookings:list', (query: unknown) => `/api/bookings${asQueryString(query)}`);
  passthrough('bookings:get', (id: unknown) => `/api/bookings/${id}`);
  passthrough('bookings:folio', (id: unknown) => `/api/bookings/${id}/folio`);
  passthrough('bookings:create', () => '/api/bookings', 'POST');
  passthrough('bookings:update', (id: unknown) => `/api/bookings/${id}`, 'PUT');
  passthrough('bookings:cancel', (id: unknown) => `/api/bookings/${id}/cancel`, 'POST');
  passthrough('bookings:checkIn', (id: unknown) => `/api/bookings/${id}/check-in`, 'POST');
  passthrough('bookings:checkOut', (id: unknown) => `/api/bookings/${id}/check-out`, 'POST');

  // Restaurant
  passthrough('restaurant:menu', () => '/api/restaurant/menu');
  passthrough('restaurant:tables', () => '/api/restaurant/tables');
  passthrough('restaurant:createCategory', () => '/api/restaurant/menu/categories', 'POST');
  passthrough('restaurant:createMenuItem', () => '/api/restaurant/menu/items', 'POST');
  passthrough('restaurant:updateMenuItem', (id: unknown) => `/api/restaurant/menu/items/${id}`, 'PUT');
  passthrough('restaurant:createTable', () => '/api/restaurant/tables', 'POST');
  passthrough('restaurant:orders', (query: unknown) => `/api/restaurant/orders${asQueryString(query)}`);
  passthrough('restaurant:getOrder', (id: unknown) => `/api/restaurant/orders/${id}`);
  passthrough('restaurant:createOrder', () => '/api/restaurant/orders', 'POST');
  passthrough('restaurant:addItems', (id: unknown) => `/api/restaurant/orders/${id}/items`, 'POST');
  passthrough('restaurant:cancelOrder', (id: unknown) => `/api/restaurant/orders/${id}/cancel`, 'POST');
  passthrough('restaurant:payOrder', (id: unknown) => `/api/restaurant/orders/${id}/pay`, 'POST');

  // Invoices
  passthrough('invoices:list', (query: unknown) => `/api/invoices${asQueryString(query)}`);
  passthrough('invoices:get', (id: unknown) => `/api/invoices/${id}`);
  passthrough('invoices:create', () => '/api/invoices', 'POST');
  passthrough('invoices:addPayment', (id: unknown) => `/api/invoices/${id}/payments`, 'POST');
  passthrough('invoices:cancel', (id: unknown) => `/api/invoices/${id}/cancel`, 'POST');

  // Expenses
  passthrough('expenses:categories', () => '/api/expenses/categories');
  passthrough('expenses:list', (query: unknown) => `/api/expenses${asQueryString(query)}`);
  passthrough('expenses:create', () => '/api/expenses', 'POST');

  // Cash sessions
  passthrough('cash:current', () => '/api/cash-sessions/current');
  passthrough('cash:open', () => '/api/cash-sessions', 'POST');
  passthrough('cash:summary', (id: unknown) => `/api/cash-sessions/${id}/summary`);
  passthrough('cash:close', (id: unknown) => `/api/cash-sessions/${id}/close`, 'POST');
  passthrough('cash:list', (query: unknown) => `/api/cash-sessions${asQueryString(query)}`);

  // Reports
  passthrough('reports:salesSummary', (query: unknown) => `/api/reports/sales-summary${asQueryString(query)}`);
  passthrough('reports:revenueByDay', (query: unknown) => `/api/reports/revenue-by-day${asQueryString(query)}`);
  passthrough('reports:paymentsByMethod', (query: unknown) => `/api/reports/payments-by-method${asQueryString(query)}`);
  passthrough('reports:topMenuItems', (query: unknown) => `/api/reports/top-menu-items${asQueryString(query)}`);
  passthrough('reports:occupancy', (query: unknown) => `/api/reports/occupancy${asQueryString(query)}`);
  passthrough('reports:outstandingDues', () => '/api/reports/outstanding-dues');
  passthrough('reports:gstSummary', (query: unknown) => `/api/reports/gst-summary${asQueryString(query)}`);
  passthrough('reports:guestReport', (query: unknown) => `/api/reports/guest-report${asQueryString(query)}`);
  passthrough('reports:expenseReport', (query: unknown) => `/api/reports/expense-report${asQueryString(query)}`);
  passthrough('reports:cancelledInvoices', (query: unknown) => `/api/reports/cancelled-invoices${asQueryString(query)}`);

  // Search, dashboard, settings, users, audit
  passthrough('search', (q: unknown) => `/api/search?q=${encodeURIComponent(String(q ?? ''))}`);
  passthrough('dashboard:summary', () => '/api/dashboard/summary');
  passthrough('hotel:get', () => '/api/hotel');
  passthrough('hotel:getSettings', () => '/api/settings');
  passthrough('settings:updateHotel', () => '/api/settings/hotel', 'PUT');
  passthrough('settings:update', () => '/api/settings', 'PUT');
  passthrough('users:list', () => '/api/users');
  passthrough('users:roles', () => '/api/users/roles');
  passthrough('users:create', () => '/api/users', 'POST');
  passthrough('users:update', (id: unknown) => `/api/users/${id}`, 'PUT');
  passthrough('users:remove', (id: unknown) => `/api/users/${id}`, 'DELETE');
  passthrough('audit:list', (query: unknown) => `/api/audit-logs${asQueryString(query)}`);
  passthrough('system:backups', () => '/api/system/backups');
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

  handle('print:kot', async (_event, payload: { data: unknown; printerName?: string; silent?: boolean; copies?: number }) => {
    try {
      await printerService.printKot(
        payload.data as Parameters<typeof printerService.printKot>[0],
        payload,
      );
      return ok({ printed: true });
    } catch (err) {
      logger.error({ err }, 'print:kot failed');
      return fail('PRINT_ERROR', err instanceof Error ? err.message : 'KOT printing failed');
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
    ok({ running: isServerRunning(), apiBase: API_BASE, crashed: false }),
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
