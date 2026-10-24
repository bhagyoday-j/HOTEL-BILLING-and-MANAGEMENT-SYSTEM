import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/table';
import { toast } from '@/stores/toastStore';

export type PrintFormat = 'A4' | 'THERMAL_80' | 'THERMAL_58';

const FORMAT_LABELS: Record<PrintFormat, string> = {
  A4: 'A4 invoice',
  THERMAL_80: 'Receipt · 80 mm',
  THERMAL_58: 'Receipt · 58 mm',
};

/**
 * Electron cannot show Chromium's print preview: `webContents.print()` hands off to
 * the Windows print dialog, which then reports "This app doesn't support print
 * preview". This dialog renders the exact document that will be printed and sends
 * the job straight to the selected printer, so no preview-less system dialog appears.
 */
export function PrintPreviewDialog({
  title,
  data,
  initialFormat = 'A4',
  onClose,
}: {
  title: string;
  data: unknown;
  initialFormat?: PrintFormat;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<PrintFormat>(initialFormat);
  const [printerName, setPrinterName] = useState('');
  const [copies, setCopies] = useState(1);
  const [printing, setPrinting] = useState(false);

  const printersQuery = useQuery({
    queryKey: ['printers'],
    queryFn: async () => {
      const res = await api.print.getPrinters();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 30_000,
  });

  const previewQuery = useQuery({
    queryKey: ['print-preview', title, format],
    queryFn: async () => {
      const res = await api.print.render({ data, format });
      if (!res.success) throw new Error(res.error.message);
      return res.data.html;
    },
  });

  // Default to the system default printer, and recover if the selected printer
  // disappears (unplugged / removed between previews).
  useEffect(() => {
    const printers = printersQuery.data ?? [];
    if (printers.length === 0) return;
    if (!printers.some((printer) => printer.name === printerName)) {
      setPrinterName((printers.find((printer) => printer.isDefault) ?? printers[0]).name);
    }
  }, [printersQuery.data, printerName]);

  const print = async (): Promise<void> => {
    if (!printerName) {
      toast.error('No printer selected', 'Choose a printer before printing.');
      return;
    }
    setPrinting(true);
    try {
      const res = await api.print.invoice({ data, format, printerName, silent: true, copies });
      if (!res.success) {
        toast.error('Print failed', res.error.message);
        return;
      }
      toast.success('Sent to printer', `${FORMAT_LABELS[format]} · ${printerName}`);
      onClose();
    } finally {
      setPrinting(false);
    }
  };

  const printers = printersQuery.data ?? [];
  // Thermal documents are laid out at exactly 58/80 mm, so the preview frame
  // adds the width of its vertical scrollbar; otherwise the receipt's right
  // edge is clipped on screen (printing itself is unaffected).
  const paperWidth =
    format === 'THERMAL_58'
      ? 'calc(58mm + 20px)'
      : format === 'THERMAL_80'
        ? 'calc(80mm + 20px)'
        : '100%';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title={title}
        description="Preview of the document. Printing goes straight to the selected printer."
        wide
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-44 space-y-1">
              <Label htmlFor="print-format">Format</Label>
              <Select
                id="print-format"
                value={format}
                onChange={(event) => setFormat(event.target.value as PrintFormat)}
              >
                {(Object.keys(FORMAT_LABELS) as PrintFormat[]).map((value) => (
                  <option key={value} value={value}>
                    {FORMAT_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-56 flex-1 space-y-1">
              <Label htmlFor="print-printer">Printer</Label>
              <Select
                id="print-printer"
                value={printerName}
                disabled={printersQuery.isLoading || printers.length === 0}
                onChange={(event) => setPrinterName(event.target.value)}
              >
                {printers.length === 0 && <option value="">No printers found</option>}
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                    {printer.isDefault ? ' (default)' : ''}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="print-copies">Copies</Label>
              <Select
                id="print-copies"
                value={String(copies)}
                onChange={(event) => setCopies(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {printersQuery.isError && (
            <ErrorState message={(printersQuery.error as Error).message} />
          )}
          {!printersQuery.isLoading && !printersQuery.isError && printers.length === 0 && (
            <p className="rounded-lg border border-border bg-paper p-3 text-sm text-ink-muted">
              No printer is installed. Add one in Windows settings, then reopen this preview.
            </p>
          )}

          <div className="flex justify-center rounded-xl bg-paper p-3">
            {previewQuery.isError ? (
              <ErrorState message={(previewQuery.error as Error).message} />
            ) : previewQuery.isLoading || !previewQuery.data ? (
              <div className="h-[52vh] w-full animate-pulse rounded-md bg-paper-elevated" />
            ) : (
              <iframe
                title="Print preview"
                srcDoc={previewQuery.data}
                sandbox=""
                className="h-[52vh] rounded-md border border-border bg-white shadow-md"
                style={{ width: paperWidth }}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-ink-muted">
              The Windows system print dialog is skipped, so there is no preview-less dialog.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={printing}>
                Cancel
              </Button>
              <Button
                onClick={() => void print()}
                disabled={
                  printing ||
                  !printerName ||
                  previewQuery.isLoading ||
                  previewQuery.isError ||
                  printersQuery.isLoading
                }
              >
                <Printer className="h-4 w-4" />
                {printing ? 'Printing…' : 'Print'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
