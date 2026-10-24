import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../security/logger';
import { renderInvoiceHtml, type InvoiceTemplateData } from './templates';
import type { PrintFormat } from '@hotel-billing/shared';

/**
 * Chromium's own print preview is not available in Electron: `webContents.print()`
 * always hands off to the Windows print dialog, which reports "This app doesn't
 * support print preview". The app therefore renders the exact document HTML and
 * shows it in its own preview window before sending the job silently to the
 * selected printer.
 *
 * All printing runs through one hidden window, one job at a time. The window is
 * reused (creating/destroying a hidden window per job crashes Electron 28 on
 * Windows), and serializing the jobs prevents a second `loadURL` from aborting
 * the first with `ERR_ABORTED (-3) loading 'data:text/html...'`.
 */

export interface InstalledPrinter {
  name: string;
  isDefault: boolean;
  status: string | number;
}

/** Transient conditions where one retry normally succeeds. */
const TRANSIENT_PRINT_ERRORS = [
  'ERR_ABORTED',
  'ERR_FAILED',
  'Render process gone',
  'Object has been destroyed',
];

let printWindow: BrowserWindow | null = null;

function createPrintWindow(): BrowserWindow {
  return new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
}

function getPrintWindow(): BrowserWindow {
  if (printWindow && !printWindow.isDestroyed()) return printWindow;
  const win = createPrintWindow();
  printWindow = win;
  win.on('closed', () => {
    if (printWindow === win) printWindow = null;
  });
  return win;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isTransient(err: unknown): boolean {
  const message = errorMessage(err);
  return TRANSIENT_PRINT_ERRORS.some((needle) => message.includes(needle));
}

/**
 * Jobs print one after another. Without this, clicking print twice (or printing a
 * receipt while an invoice is still loading) started a second navigation on the
 * same window, which cancelled the first: `ERR_ABORTED (-3)`.
 */
let printQueue: Promise<unknown> = Promise.resolve();

function enqueuePrint<T>(job: () => Promise<T>): Promise<T> {
  const run = printQueue.then(job, job);
  printQueue = run.catch(() => undefined);
  return run;
}

export class PrinterService {
  /** The exact document that will be printed, for the in-app preview. */
  renderPreview(data: InvoiceTemplateData, format: PrintFormat): string {
    return renderInvoiceHtml(data, format);
  }

  async getPrinters(): Promise<InstalledPrinter[]> {
    const win = getPrintWindow();
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status ?? 'unknown',
    }));
  }

  /** Render the document in the hidden window, then print it. */
  private async printHtml(
    html: string,
    opts: { printerName?: string; silent?: boolean; copies?: number },
  ): Promise<void> {
    await enqueuePrint(async () => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const win = getPrintWindow();
        try {
          // Load first: printing must never start on a partially rendered
          // receipt, and a failed load must not be followed by a print.
          await this.loadDocument(win, html);

          const printers = await win.webContents.getPrintersAsync();
          if (opts.printerName && !printers.some((p) => p.name === opts.printerName)) {
            throw new Error(`Printer "${opts.printerName}" is not available`);
          }

          const copies = Math.min(5, Math.max(1, opts.copies ?? 1));
          for (let i = 0; i < copies; i++) {
            await this.printOnce(win, opts);
          }
          return;
        } catch (err) {
          // Retry once: if a load was aborted, Chromium has already discarded
          // that navigation and the same window can render the document again.
          if (attempt === 1 && isTransient(err)) {
            logger.warn({ err, attempt }, 'Transient print failure; retrying the document load');
            continue;
          }
          logger.error({ err }, 'Print job failed');
          if (err instanceof Error && /^Printer ".+" is not available$/.test(err.message)) {
            throw err;
          }
          throw new Error(
            'The document could not be printed. Check that the printer is connected and try again.',
          );
        }
      }
    });
  }

  /**
   * `loadURL` resolves once the document has finished loading, so `print()` is
   * never called on a partially rendered page. If a load is still in flight
   * (e.g. a slow system font), wait for it explicitly.
   */
  private async loadDocument(win: BrowserWindow, html: string): Promise<void> {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (win.webContents.isLoading()) {
      await new Promise<void>((resolve) => win.webContents.once('did-stop-loading', () => resolve()));
    }
  }

  private printOnce(
    win: BrowserWindow,
    opts: { printerName?: string; silent?: boolean },
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: opts.silent ?? false,
          printBackground: true,
          deviceName: opts.printerName || undefined,
          margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
        },
        (success, failureReason) => {
          if (success) {
            resolve();
            return;
          }
          // Closing the system print dialog is a user action, not a failure.
          if (!failureReason || /cancel/i.test(failureReason)) {
            resolve();
            return;
          }
          reject(new Error(failureReason));
        },
      );
    });
  }

  async printInvoice(
    data: InvoiceTemplateData,
    opts: { format: PrintFormat; printerName?: string; silent?: boolean; copies?: number },
  ): Promise<void> {
    const html = renderInvoiceHtml(data, opts.format);
    await this.printHtml(html, opts);
  }

  async testPrint(printerName?: string): Promise<void> {
    const html = `<!doctype html><html><body style="font-family:sans-serif;padding:20px">
      <h2>Hotel Billing — Test Print</h2>
      <p>Printer: ${printerName ?? '(system default)'}</p>
      <p>Time: ${new Date().toLocaleString('en-IN')}</p>
      <p>If you can read this, the printer is configured correctly.</p>
    </body></html>`;
    await this.printHtml(html, { printerName, silent: true });
  }

  /** Save invoice HTML/PDF copy under invoices/YYYY/MM/. */
  async saveInvoiceCopy(data: InvoiceTemplateData, format: PrintFormat, invoicesDir: string): Promise<string> {
    const now = new Date();
    const dir = path.join(invoicesDir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
    fs.mkdirSync(dir, { recursive: true });

    const safeName = data.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '_');
    const ext = format === 'A4' ? 'html' : 'html';
    const filePath = path.join(dir, `${safeName}.${ext}`);
    const html = renderInvoiceHtml(data, format);

    // Avoid unbounded duplicate copies: overwrite same-number copies only
    fs.writeFileSync(filePath, html, 'utf-8');
    logger.info({ filePath }, 'Invoice copy saved');
    return filePath;
  }
}

export const printerService = new PrinterService();
