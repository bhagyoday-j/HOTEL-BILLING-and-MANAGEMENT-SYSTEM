import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Ban, Plus } from 'lucide-react';
import { api, type InvoiceDetail } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, THead, TBody, TR, TH, TD, EmptyState, ErrorState } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/cn';

export function InvoicesPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const invoicesQuery = useQuery({
    queryKey: ['invoices', search, statusFilter, page],
    queryFn: async () => {
      const res = await api.invoices.list({ search, status: statusFilter || undefined, page, pageSize: 25 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const invoices = invoicesQuery.data?.items ?? [];
  const total = invoicesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (invoicesQuery.data?.pageSize ?? 25)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Invoices</h1>
          <p className="mt-1 text-sm text-ink-muted">{total} invoices</p>
        </div>
        {hasPermission('INVOICE_CREATE') && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Invoice
          </Button>
        )}
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search invoice #, guest name, mobile…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-80"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          {['DRAFT', 'ISSUED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'REFUNDED'].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>

      {invoicesQuery.isError && <ErrorState message={(invoicesQuery.error as Error).message} />}

      {invoicesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-paper-elevated" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="Invoices are generated at checkout, POS payment, or manually."
          action={
            hasPermission('INVOICE_CREATE') && <Button onClick={() => setCreating(true)}>New Invoice</Button>
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Room</TH>
              <TH className="text-right">Amount</TH>
              <TH className="text-right">Due</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {invoices.map((inv) => (
              <TR key={inv.id} onClick={() => setSelectedId(inv.id)}>
                <TD className="font-mono text-xs">{inv.invoiceNumber}</TD>
                <TD className="text-xs">{new Date(inv.invoiceDate).toLocaleDateString('en-IN')}</TD>
                <TD className="font-medium">{inv.guestName ?? 'Walk-in'}</TD>
                <TD>{inv.room?.number ?? '—'}</TD>
                <TD className="text-right">{formatCurrency(inv.grandTotal)}</TD>
                <TD className="text-right">{formatCurrency(inv.dueAmount)}</TD>
                <TD>
                  <StatusBadge status={inv.status} />
                </TD>
                <TD className="text-right">
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedId(inv.id); }}>
                    View
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-ink-muted">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <InvoiceDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New Invoice" description="Create a manual invoice for services or walk-ins." wide>
          <ManualInvoiceForm
            onDone={() => {
              setCreating(false);
              void queryClient.invalidateQueries({ queryKey: ['invoices'] });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const invoiceQuery = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const res = await api.invoices.get(id!);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: id !== null,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const addPaymentMutation = useMutation({
    mutationFn: () =>
      api.invoices.addPayment(id!, {
        method: paymentMethod,
        amount: paymentAmount,
        reference: paymentRef || undefined,
      }),
    onSuccess: () => {
      toast.success('Payment recorded');
      setPaying(false);
      setPaymentAmount('');
      setPaymentRef('');
      invalidate();
    },
    onError: (err: Error) => toast.error('Payment failed', err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => api.invoices.cancel(id!, reason),
    onSuccess: () => {
      toast.success('Invoice cancelled');
      invalidate();
    },
    onError: (err: Error) => toast.error('Cancel failed', err.message),
  });

  const invoice = invoiceQuery.data;
  const printData = useMemo(() => {
    if (!invoice) return null;
    return {
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      status: invoice.status,
      hotel: {
        name: 'Hotel',
        address: null,
        city: null,
        state: null,
        phone: null,
        email: null,
        gstin: null,
      },
      guestName: invoice.guestName,
      guestMobile: invoice.guestMobile,
      roomNumber: invoice.room?.number ?? null,
      items: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discountAmount: i.discountAmount,
        lineTotal: i.lineTotal,
      })),
      subtotal: invoice.subtotal,
      discountAmount: invoice.discountAmount,
      taxableAmount: invoice.taxableAmount,
      cgstAmount: invoice.cgstAmount,
      sgstAmount: invoice.sgstAmount,
      igstAmount: invoice.igstAmount,
      totalTax: invoice.totalTax,
      roundingAmount: invoice.roundingAmount,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      dueAmount: invoice.dueAmount,
      payments: invoice.payments.map((p) => ({
        paymentNumber: p.paymentNumber,
        method: p.method,
        amount: p.amount,
      })),
      terms: invoice.terms,
      receiptFooter: null,
    };
  }, [invoice]);

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      {invoice && (
        <DialogContent
          title={invoice.invoiceNumber}
          description={`${new Date(invoice.invoiceDate).toLocaleString('en-IN')} · ${invoice.status.replace(/_/g, ' ')}`}
          wide
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-display text-xl text-forest-deep">
                  {invoice.guestName ?? 'Walk-in'}
                </div>
                {invoice.room && <div className="text-sm text-ink-muted">Room {invoice.room.number}</div>}
              </div>
              <StatusBadge status={invoice.status} />
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.items.map((i) => (
                  <TR key={i.id}>
                    <TD>{i.description}</TD>
                    <TD className="text-right">{Number(i.quantity)}</TD>
                    <TD className="text-right">{formatCurrency(i.unitPrice)}</TD>
                    <TD className="text-right">{formatCurrency(i.lineTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Payments</h4>
                  {invoice.payments.length === 0 ? (
                    <p className="text-sm text-ink-muted">No payments recorded</p>
                  ) : (
                    <div className="space-y-1.5">
                      {invoice.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-paper px-3 py-2 text-sm">
                          <span>
                            <span className="font-medium">{p.method}</span>
                            <span className="ml-2 font-mono text-xs text-ink-muted">{p.paymentNumber}</span>
                          </span>
                          <span>{formatCurrency(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && hasPermission('PAYMENT_CREATE') && (
                  paying ? (
                    <div className="space-y-2 rounded-lg border border-border bg-paper p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                          {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'].map((m) => (
                            <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                        />
                      </div>
                      <Input
                        placeholder="Reference (optional)"
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPaying(false)}>Cancel</Button>
                        <Button
                          size="sm"
                          disabled={!paymentAmount || Number(paymentAmount) <= 0 || addPaymentMutation.isPending}
                          onClick={() => addPaymentMutation.mutate()}
                        >
                          Record
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setPaying(true)}>
                      Record payment
                    </Button>
                  )
                )}
              </div>

              <div className="space-y-1 text-sm">
                <SumRow label="Subtotal" value={formatCurrency(invoice.subtotal)} />
                <SumRow label="Discount" value={`− ${formatCurrency(invoice.discountAmount)}`} />
                <SumRow label="Taxable" value={formatCurrency(invoice.taxableAmount)} />
                {Number(invoice.cgstAmount) > 0 && <SumRow label="CGST" value={formatCurrency(invoice.cgstAmount)} />}
                {Number(invoice.sgstAmount) > 0 && <SumRow label="SGST" value={formatCurrency(invoice.sgstAmount)} />}
                {Number(invoice.igstAmount) > 0 && <SumRow label="IGST" value={formatCurrency(invoice.igstAmount)} />}
                <SumRow label="Total tax" value={formatCurrency(invoice.totalTax)} />
                <SumRow label="Grand total" value={formatCurrency(invoice.grandTotal)} strong />
                <SumRow label="Paid" value={formatCurrency(invoice.paidAmount)} />
                <SumRow label="Due" value={formatCurrency(invoice.dueAmount)} strong tone={Number(invoice.dueAmount) > 0 ? 'danger' : undefined} />
              </div>
            </div>

            <div className="flex justify-between border-t border-border pt-4">
              <div>
                {invoice.status !== 'CANCELLED' && hasPermission('INVOICE_CANCEL') && (
                  <Button
                    variant="ghost"
                    className="text-danger"
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Cancel invoice',
                          message: 'Canceling an issued invoice cannot be undone. The invoice number remains in audit history.',
                          confirmLabel: 'Cancel invoice',
                          danger: true,
                        })
                      ) {
                        const reason = window.prompt('Cancellation reason:');
                        if (reason) cancelMutation.mutate(reason);
                      }
                    }}
                  >
                    <Ban className="h-4 w-4" /> Cancel invoice
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {printData && (
                  <>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const res = await api.print.invoice({ data: printData, format: 'A4' });
                        if (res.success) toast.success('Sent to printer');
                        else toast.error('Print failed', res.error.message);
                      }}
                    >
                      <Printer className="h-4 w-4" /> Print (A4)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const res = await api.print.invoice({ data: printData, format: 'THERMAL_80' });
                        if (res.success) toast.success('Sent to printer');
                        else toast.error('Print failed', res.error.message);
                      }}
                    >
                      <Printer className="h-4 w-4" /> Print (80mm)
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function SumRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="flex justify-between">
      <span className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</span>
      <span className={tone === 'danger' ? 'font-semibold text-danger' : strong ? 'font-semibold text-ink' : 'text-ink'}>
        {value}
      </span>
    </div>
  );
}

function ManualInvoiceForm({ onDone }: { onDone: () => void }) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [guestName, setGuestName] = useState('');
  const [guestMobile, setGuestMobile] = useState('');
  const [method, setMethod] = useState('CASH');
  const [submitting, setSubmitting] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ['hotel-settings'],
    queryFn: async () => {
      const res = await api.hotel.getSettings();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const gross = Number(quantity || '0') * Number(unitPrice || '0');
  const tax = (gross * Number(taxRate || '0')) / 100;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.invoices.create({
        guestName: guestName || 'Walk-in',
        guestMobile: guestMobile || undefined,
        items: [{ description, quantity, unitPrice, taxRate }],
        payments: method === 'CREDIT' ? [] : [{ method, amount: (gross + tax).toFixed(2) }],
      });
      if (res.success) {
        toast.success(`Invoice ${res.data.invoiceNumber} created`);
        onDone();
      } else {
        toast.error('Invoice failed', res.error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const settings = settingsQuery.data;
  void settings;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Guest name</Label>
          <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Walk-in" />
        </div>
        <div className="space-y-1.5">
          <Label>Mobile</Label>
          <Input value={guestMobile} onChange={(e) => setGuestMobile(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-paper p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Line item</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Description *</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Unit price *</Label>
            <Input type="number" step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tax rate %</Label>
            <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Payment method</Label>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'].map((m) => (
              <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5 rounded-lg border border-border bg-paper p-3">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Total incl. tax</span>
            <span className="font-semibold">{formatCurrency(gross + tax)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button disabled={submitting || !description || !unitPrice} onClick={() => void submit()}>
          {submitting ? 'Creating…' : 'Create invoice'}
        </Button>
      </div>
    </div>
  );
}
