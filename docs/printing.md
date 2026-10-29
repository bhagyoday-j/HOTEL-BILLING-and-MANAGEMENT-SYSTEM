# Printing

Implemented in the Electron main process (`apps/desktop/electron/printing`).

## Capabilities

- Formats: `A4`, `THERMAL_80` (80mm) and `THERMAL_58` (58mm).
- 58mm thermal receipt is the default preview/print format; users can switch to 80mm or A4.
- Newly created bills from **Tables** and **Menu & Billing** can be previewed and printed without
  leaving that screen.
- Printer discovery via `webContents.getPrintersAsync()`.
- Invoice/receipt printing through a hidden `BrowserWindow` (`webContents.print()`), with optional
  silent printing and 1–5 copies.
- Test print to a chosen printer.
- Saving an HTML invoice copy under `invoices/YYYY/MM/`.

The print window is created with `contextIsolation: true`, `nodeIntegration: false` and JavaScript
disabled.

## Templates

`templates.ts` renders a complete HTML document per format. Page size is set with CSS `@page`
(`A4`, `80mm auto`, `58mm auto`), user-supplied values are HTML-escaped, and zero tax/rounding rows
are omitted.

## IPC surface

- `window.api.print.getPrinters()`
- `window.api.print.invoice({ data, format, printerName?, silent?, copies? })`
- `window.api.print.test(printerName?)`
- `window.api.print.saveCopy({ data, format })`

## Verification status

- Templates: unit-tested (`templates.test.ts`).
- Printer discovery: verified on Windows (`getPrintersAsync()` returns installed printers).
- Print pipeline: the real templates render through Electron's print pipeline to valid PDFs
  (A4/80mm/58mm).
- **Physical output on receipt paper is not yet verified** — confirm once on the target Windows
  machine with a printer attached.
