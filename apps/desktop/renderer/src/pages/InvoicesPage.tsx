import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Pencil, Printer, Trash2 } from 'lucide-react';
import { api, type UpdateBillInput } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { PrintPreviewDialog, type PrintFormat } from '@/components/PrintPreviewDialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/cn';
import { invoicePrintData } from '@/utils/invoicePrintData';

export function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const billsQuery = useQuery({
    queryKey: ['bills', search, status, page],
    queryFn: async () => {
      const res = await api.bills.list({ search: search || undefined, status: status || undefined, page, pageSize: 25 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
  const bills = billsQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((billsQuery.data?.total ?? 0) / (billsQuery.data?.pageSize ?? 25)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Bills</h1>
        <p className="mt-1 text-sm text-ink-muted">{billsQuery.data?.total ?? 0} bills</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="w-80"
          placeholder="Search bill number, customer, mobile"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
        <Select className="w-48" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['PAID', 'CANCELLED', 'DRAFT', 'REFUNDED'].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </div>

      {billsQuery.isError && <ErrorState message={(billsQuery.error as Error).message} />}
      {billsQuery.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-paper-elevated" />
      ) : bills.length === 0 ? (
        <EmptyState title="No bills found" description="Bills created from Menu & Billing will appear here." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Bill</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Created by</TH>
              <TH>Status</TH>
              <TH className="text-right">Total</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {bills.map((bill) => (
              <TR key={bill.id} onClick={() => setSelectedId(bill.id)}>
                <TD className="font-mono text-xs">{bill.billNumber}</TD>
                <TD>{new Date(bill.date).toLocaleDateString('en-IN')}</TD>
                <TD>{bill.customerName ?? 'Walk-in'}</TD>
                <TD>{bill.createdBy ?? '—'}</TD>
                <TD><StatusBadge status={bill.status} /></TD>
                <TD className="text-right">{formatCurrency(bill.grandTotal)}</TD>
                <TD className="text-right">
                  <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setSelectedId(bill.id); }}>
                    View / print
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <span className="text-ink-muted">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      )}
      <BillDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function BillDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const queryClient = useQueryClient();
  // The cancellation reason is collected in an in-app form: Electron does not
  // support window.prompt(), so asking for it that way silently aborted the
  // cancellation and left the bill (and revenue) unchanged in the desktop app.
  const [cancelFormOpen, setCancelFormOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [editDraft, setEditDraft] = useState<UpdateBillInput | null>(null);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  // Print now opens an in-app preview first: Electron's native print dialog has no
  // preview, so the document is shown before the job is sent to the printer.
  const [previewFormat, setPreviewFormat] = useState<PrintFormat | null>(null);

  useEffect(() => {
    setCancelFormOpen(false);
    setCancelReason('');
    setPreviewFormat(null);
    setEditDraft(null);
    setSelectedMenuItemId('');
  }, [id]);

  const billQuery = useQuery({
    queryKey: ['bill', id],
    queryFn: async () => {
      const res = await api.bills.get(id!);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: id !== null,
  });
  const hotelQuery = useQuery({
    queryKey: ['hotel'],
    queryFn: async () => {
      const res = await api.hotel.get();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: id !== null,
  });
  const editMenuQuery = useQuery({
    queryKey: ['menu', 'bill-edit-items'],
    queryFn: async () => {
      const res = await api.menu.list({ available: 'true' });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: editDraft !== null,
  });
  const cancelMutation = useMutation({
    mutationFn: async (reason: string) => {
      const res = await api.bills.cancel(id!, reason);
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success('Bill cancelled');
      setCancelFormOpen(false);
      setCancelReason('');
      void queryClient.invalidateQueries({ queryKey: ['bill', id] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: Error) => toast.error('Bill could not be cancelled', err.message),
  });
  const updateMutation = useMutation({
    mutationFn: async (data: UpdateBillInput) => {
      const res = await api.bills.update(id!, data);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (updatedBill) => {
      toast.success('Bill updated', `${updatedBill.billNumber} · ${formatCurrency(updatedBill.grandTotal)}`);
      setEditDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['bill', id] });
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['customer-lookup'] });
    },
    onError: (err: Error) => toast.error('Bill could not be updated', err.message),
  });
  const bill = billQuery.data;

  // The exact document shown in the preview and sent to the printer.
  const invoiceData = bill && hotelQuery.data ? invoicePrintData(bill, hotelQuery.data) : null;

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      {id !== null && (
        <DialogContent title={bill ? `Bill ${bill.billNumber}` : 'Bill details'} wide>
          {billQuery.isLoading ? (
            <div className="h-36 animate-pulse rounded-lg bg-paper" />
          ) : billQuery.isError ? (
            <ErrorState message={(billQuery.error as Error).message} />
          ) : bill ? (
            <div className="space-y-5">
              {hotelQuery.isError && <ErrorState message={(hotelQuery.error as Error).message} />}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-ink-muted">Date:</span> {new Date(bill.date).toLocaleString('en-IN')}</div>
                <div><span className="text-ink-muted">Status:</span> <StatusBadge status={bill.status} /></div>
                <div><span className="text-ink-muted">Customer:</span> {bill.customerName ?? 'Walk-in'}</div>
                <div><span className="text-ink-muted">Mobile:</span> {bill.customerMobile ?? '—'}</div>
                {bill.tableNumber && (
                  <div><span className="text-ink-muted">Table:</span> {bill.tableNumber}</div>
                )}
              </div>
              <Table>
                <THead>
                  <TR><TH>Item</TH><TH className="text-right">Qty</TH><TH className="text-right">Price</TH><TH className="text-right">Line total</TH></TR>
                </THead>
                <TBody>
                  {bill.items.map((item) => (
                    <TR key={item.id}>
                      <TD>{item.name}</TD>
                      <TD className="text-right">{item.quantity}</TD>
                      <TD className="text-right">{formatCurrency(item.unitPrice)}</TD>
                      <TD className="text-right">{formatCurrency(item.lineTotal)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <div className="ml-auto max-w-xs space-y-1 text-sm">
                <Amount label="Subtotal" value={bill.subtotal} />
                {Number(bill.discountAmount) !== 0 && (
                  <Amount label="Discount" value={bill.discountAmount} />
                )}
                <Amount label="Tax" value={bill.totalTax} />
                <Amount label="Grand total" value={bill.grandTotal} strong />
              </div>
              {bill.cancelReason && <p className="text-sm text-danger">Cancellation reason: {bill.cancelReason}</p>}
              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <div className="flex gap-2">
                  {bill.status === 'PAID' && hasPermission('BILL_CREATE') && !editDraft && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setEditDraft({
                          customerName: bill.customerName ?? '',
                          customerMobile: bill.customerMobile ?? '',
                          notes: bill.notes ?? '',
                          discountAmount: Number(bill.discountAmount) === 0 ? '' : bill.discountAmount,
                          items: bill.items.map((item) => ({ id: item.id, quantity: item.quantity })),
                        })
                      }
                    >
                      <Pencil className="h-4 w-4" /> Edit bill
                    </Button>
                  )}
                  {bill.status !== 'CANCELLED' && hasPermission('BILL_CANCEL') ? (
                    <Button
                      variant="danger"
                      disabled={cancelMutation.isPending || cancelFormOpen || Boolean(editDraft)}
                      onClick={() => setCancelFormOpen(true)}
                    >
                      <Ban className="h-4 w-4" /> Cancel bill
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!invoiceData} onClick={() => setPreviewFormat('THERMAL_58')}>
                    <Printer className="h-4 w-4" /> Preview receipt (58mm)
                  </Button>
                  <Button variant="outline" disabled={!invoiceData} onClick={() => setPreviewFormat('A4')}>
                    <Printer className="h-4 w-4" /> Preview A4 invoice
                  </Button>
                </div>
              </div>
              {editDraft && (
                <form
                  className="space-y-4 rounded-lg border border-border bg-paper-elevated p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateMutation.mutate(editDraft);
                  }}
                >
                  <div>
                    <h3 className="font-semibold text-forest-deep">Edit finalized bill</h3>
                    <p className="mt-1 text-xs text-ink-muted">
                      Existing lines keep their billed prices and tax rates; added items use current menu prices and taxes. The paid total is recalculated, and before/after values are audited.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="edit-bill-customer">Customer name</Label>
                      <Input
                        id="edit-bill-customer"
                        maxLength={120}
                        value={editDraft.customerName ?? ''}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, customerName: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-bill-mobile">Customer mobile</Label>
                      <Input
                        id="edit-bill-mobile"
                        maxLength={20}
                        value={editDraft.customerMobile ?? ''}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, customerMobile: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-bill-notes">Notes</Label>
                      <Input
                        id="edit-bill-notes"
                        maxLength={500}
                        value={editDraft.notes ?? ''}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, notes: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-bill-discount">Discount amount</Label>
                      <Input
                        id="edit-bill-discount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={editDraft.discountAmount ?? ''}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, discountAmount: event.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Bill items</Label>
                    <div className="flex gap-2">
                      <Select
                        aria-label="Add menu item to bill"
                        value={selectedMenuItemId}
                        disabled={editMenuQuery.isLoading || editMenuQuery.isError}
                        onChange={(event) => setSelectedMenuItemId(event.target.value)}
                      >
                        <option value="">Select an available menu item</option>
                        {(editMenuQuery.data?.items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} · {formatCurrency(item.price)}
                          </option>
                        ))}
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!selectedMenuItemId || editMenuQuery.isError}
                        onClick={() => {
                          const existing = editDraft.items.find(
                            (line) => line.menuItemId === selectedMenuItemId,
                          );
                          setEditDraft({
                            ...editDraft,
                            items: existing
                              ? editDraft.items.map((line) =>
                                  line.menuItemId === selectedMenuItemId
                                    ? { ...line, quantity: String(Number(line.quantity) + 1) }
                                    : line,
                                )
                              : [
                                  ...editDraft.items,
                                  { menuItemId: selectedMenuItemId, quantity: '1' },
                                ],
                          });
                          setSelectedMenuItemId('');
                        }}
                      >
                        Add item
                      </Button>
                    </div>
                    {editMenuQuery.isError && (
                      <ErrorState message={(editMenuQuery.error as Error).message} />
                    )}
                    {editDraft.items.map((line) => {
                      const oldItem = line.id
                        ? bill.items.find((candidate) => candidate.id === line.id)
                        : undefined;
                      const newItem = line.menuItemId
                        ? editMenuQuery.data?.items.find((candidate) => candidate.id === line.menuItemId)
                        : undefined;
                      const itemName = oldItem?.name ?? newItem?.name;
                      if (!itemName) return null;
                      return (
                        <div key={line.id ?? line.menuItemId} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-center gap-2">
                          <span className="truncate text-sm">{itemName}</span>
                          <Input
                            aria-label={`${itemName} quantity`}
                            type="number"
                            min="1"
                            max="999"
                            step="1"
                            required
                            value={line.quantity}
                            onChange={(event) =>
                              setEditDraft({
                                ...editDraft,
                                items: editDraft.items.map((current) =>
                                  current.id === line.id &&
                                  current.menuItemId === line.menuItemId
                                    ? { ...current, quantity: event.target.value }
                                    : current,
                                ),
                              })
                            }
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${itemName} from bill`}
                            onClick={() =>
                              setEditDraft({
                                ...editDraft,
                                items: editDraft.items.filter(
                                  (current) =>
                                    current.id !== line.id ||
                                    current.menuItemId !== line.menuItemId,
                                ),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </div>
                      );
                    })}
                    {editDraft.items.length === 0 && (
                      <p className="text-xs text-danger">A bill must keep at least one item.</p>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">
                    Bills with recorded payment transactions cannot be edited; payment history is never rewritten.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={updateMutation.isPending}
                      onClick={() => setEditDraft(null)}
                    >
                      Keep bill unchanged
                    </Button>
                    <Button type="submit" disabled={updateMutation.isPending || editDraft.items.length === 0}>
                      {updateMutation.isPending ? 'Saving…' : 'Save bill changes'}
                    </Button>
                  </div>
                </form>
              )}
              {cancelFormOpen && (
                <form
                  className="space-y-3 rounded-lg border border-danger/30 bg-danger/5 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const reason = cancelReason.trim();
                    if (reason) cancelMutation.mutate(reason);
                  }}
                >
                  <div className="space-y-1">
                    <Label htmlFor="cancel-reason">Cancellation reason</Label>
                    <Input
                      id="cancel-reason"
                      autoFocus
                      maxLength={200}
                      placeholder="Why is this bill being cancelled?"
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                    />
                    <p className="text-xs text-ink-muted">
                      The bill stays in financial history but its amount is removed from revenue totals.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="danger" disabled={!cancelReason.trim() || cancelMutation.isPending}>
                      {cancelMutation.isPending ? 'Cancelling…' : 'Confirm cancellation'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cancelMutation.isPending}
                      onClick={() => {
                        setCancelFormOpen(false);
                        setCancelReason('');
                      }}
                    >
                      Keep bill
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ) : null}
        </DialogContent>
      )}

      {invoiceData && previewFormat && bill && (
        <PrintPreviewDialog
          title={`Print bill ${bill.billNumber}`}
          data={invoiceData}
          initialFormat={previewFormat}
          onClose={() => setPreviewFormat(null)}
        />
      )}
    </Dialog>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t border-border pt-2 font-semibold text-ink' : 'text-ink-muted'}`}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}
