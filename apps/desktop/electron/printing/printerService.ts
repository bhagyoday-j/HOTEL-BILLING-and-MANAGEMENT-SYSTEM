import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../security/logger';
import { renderInvoiceHtml, renderKotHtml, type InvoiceTemplateData, type KotTemplateData } from './templates';
import type { PrintFormat } from '@hotel-billing/shared';

export interface InstalledPrinter {
  name: string;
  isDefault: boolean;
  status: string | number;
}

let printWindow: BrowserWindow | null = null;

function getPrintWindow(): BrowserWindow {
  if (printWindow && !printWindow.isDestroyed()) return printWindow;
  printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      javascript: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  printWindow.on('closed', () => {
    printWindow = null;
  });
  return printWindow;
}

export class PrinterService {
  async getPrinters(): Promise<InstalledPrinter[]> {
    const win = getPrintWindow();
    const printers = await win.webContents.getPrintersAsync();
    return printers.map((p) => ({
      name: p.name,
      isDefault: p.isDefault,
      status: p.status ?? 'unknown',
    }));
  }

  /** Render HTML in the hidden window and print silently or with dialog. */
  private async printHtml(html: string, opts: { printerName?: string; silent?: boolean; copies?: number }): Promise<void> {
    const win = getPrintWindow();
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const printers = await win.webContents.getPrintersAsync();
    if (opts.printerName && !printers.some((p) => p.name === opts.printerName)) {
      throw new Error(`Printer "${opts.printerName}" is not available`);
    }

    const copies = Math.min(5, Math.max(1, opts.copies ?? 1));
    for (let i = 0; i < copies; i++) {
      await new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: opts.silent ?? false,
            printBackground: true,
            deviceName: opts.printerName || undefined,
            margins: { marginType: 'custom', top: 0, bottom: 0, left: 0, right: 0 },
          },
          (success, failureReason) => {
            if (!success && failureReason && failureReason !== 'cancelled') {
              reject(new Error(failureReason));
            } else {
              resolve();
            }
          },
        );
      });
    }
  }

  async printInvoice(
    data: InvoiceTemplateData,
    opts: { format: PrintFormat; printerName?: string; silent?: boolean; copies?: number },
  ): Promise<void> {
    const html = renderInvoiceHtml(data, opts.format);
    await this.printHtml(html, opts);
  }

  async printKot(
    data: KotTemplateData,
    opts: { printerName?: string; silent?: boolean; copies?: number },
  ): Promise<void> {
    const html = renderKotHtml(data);
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
