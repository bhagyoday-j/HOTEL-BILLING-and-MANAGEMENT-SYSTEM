import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, LogIn, LogOut as LogoutIcon, XCircle, CalendarDays, IndianRupee } from 'lucide-react';
import { api, type Booking } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, THead, TBody, TR, TH, TD, EmptyState, ErrorState } from '@/components/ui/table';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/cn';

const bookingSchema = z
  .object({
    guestId: z.string().min(1, 'Select a guest'),
    roomId: z.string().min(1, 'Select a room'),
    checkInDate: z.string().min(1, 'Check-in date is required'),
    checkOutDate: z.string().min(1, 'Check-out date is required'),
    adults: z.coerce.number().int().min(1, 'At least 1 adult'),
    children: z.coerce.number().int().min(0).optional(),
    roomRate: z.string().min(1, 'Room rate is required'),
    discountAmount: z.string().optional(),
    advancePayment: z.string().optional(),
    specialRequests: z.string().optional(),
  })
  .refine((v) => new Date(v.checkOutDate) > new Date(v.checkInDate), {
    message: 'Check-out must be after check-in',
    path: ['checkOutDate'],
  });

type BookingForm = z.infer<typeof bookingSchema>;

export function BookingsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [checkingIn, setCheckingIn] = useState<Booking | null>(null);
  const [checkingOut, setCheckingOut] = useState<Booking | null>(null);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const bookingsQuery = useQuery({
    queryKey: ['bookings', statusFilter, search],
    queryFn: async () => {
      const res = await api.bookings.list({
        status: statusFilter || undefined,
        search: search || undefined,
        pageSize: 50,
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    void queryClient.invalidateQueries({ queryKey: ['rooms-grid'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const checkInMutation = useMutation({
    mutationFn: (id: string) => api.bookings.checkIn(id),
    onSuccess: () => {
      toast.success('Checked in', 'Room is now occupied');
      setCheckingIn(null);
      invalidate();
    },
    onError: (err: Error) => toast.error('Check-in failed', err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.bookings.cancel(id, reason),
    onSuccess: () => {
      toast.success('Booking cancelled');
      invalidate();
    },
    onError: (err: Error) => toast.error('Cancel failed', err.message),
  });

  const bookings = bookingsQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Bookings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {bookings.length} booking{bookings.length === 1 ? '' : 's'}
          </p>
        </div>
        {hasPermission('BOOKING_CREATE') && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New Booking
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Input
          placeholder="Search booking #, guest, room…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-44">
          <option value="">All statuses</option>
          {['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>

      {bookingsQuery.isError && <ErrorState message={(bookingsQuery.error as Error).message} />}

      {bookingsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-paper-elevated" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <EmptyState
          title="No bookings found"
          description="Create a booking to reserve a room for a guest."
          action={
            hasPermission('BOOKING_CREATE') && (
              <Button onClick={() => setCreating(true)}>New Booking</Button>
            )
          }
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Booking</TH>
              <TH>Guest</TH>
              <TH>Room</TH>
              <TH>Dates</TH>
              <TH>Advance</TH>
              <TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {bookings.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono text-xs">{b.bookingNumber}</TD>
                <TD className="font-medium">{b.guest.fullName}</TD>
                <TD>{b.room.number}</TD>
                <TD className="text-xs text-ink-muted">
                  {new Date(b.checkInDate).toLocaleDateString('en-IN')} →{' '}
                  {new Date(b.checkOutDate).toLocaleDateString('en-IN')}
                </TD>
                <TD>{formatCurrency(b.advancePayment)}</TD>
                <TD>
                  <StatusBadge status={b.status} />
                </TD>
                <TD className="text-right">
                  <BookingActions
                    booking={b}
                    onCheckIn={() => setCheckingIn(b)}
                    onCheckOut={() => setCheckingOut(b)}
                    onCancel={async () => {
                      if (
                        await confirmDialog({
                          title: 'Cancel booking',
                          message: `Cancel booking ${b.bookingNumber}? The room will be released.`,
                          confirmLabel: 'Cancel booking',
                          danger: true,
                        })
                      ) {
                        const reason = window.prompt('Cancellation reason:');
                        if (reason) cancelMutation.mutate({ id: b.id, reason });
                      }
                    }}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Create / edit dialog */}
      <Dialog open={creating || editing !== null} onOpenChange={(o) => {
        if (!o) {
          setCreating(false);
          setEditing(null);
        }
      }}>
        <DialogContent
          title={editing ? `Edit ${editing.bookingNumber}` : 'New Booking'}
          description="Overlapping bookings for the same room are prevented automatically."
          wide
        >
          <BookingFormDialog
            booking={editing}
            onDone={() => {
              setCreating(false);
              setEditing(null);
              invalidate();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Check-in dialog */}
      <Dialog open={checkingIn !== null} onOpenChange={(o) => !o && setCheckingIn(null)}>
        {checkingIn && (
          <DialogContent
            title={`Check in ${checkingIn.bookingNumber}`}
            description={`${checkingIn.guest.fullName} · Room ${checkingIn.room.number}. The room becomes OCCUPIED.`}
          >
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-paper p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-muted">Room rate</span>
                  <span>{formatCurrency(checkingIn.roomRate)} / night</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-ink-muted">Advance paid</span>
                  <span>{formatCurrency(checkingIn.advancePayment)}</span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setCheckingIn(null)}>
                  Back
                </Button>
                <Button
                  disabled={checkInMutation.isPending}
                  onClick={() => checkInMutation.mutate(checkingIn.id)}
                >
                  <LogIn className="h-4 w-4" />
                  {checkInMutation.isPending ? 'Checking in…' : 'Confirm check-in'}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* Checkout dialog */}
      <Dialog open={checkingOut !== null} onOpenChange={(o) => !o && setCheckingOut(null)}>
        {checkingOut && (
          <CheckoutDialog
            booking={checkingOut}
            onClose={() => setCheckingOut(null)}
            onDone={() => {
              setCheckingOut(null);
              invalidate();
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function BookingActions({
  booking,
  onCheckIn,
  onCheckOut,
  onCancel,
}: {
  booking: Booking;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onCancel: () => void;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return (
    <div className="flex justify-end gap-1">
      {booking.status === 'CONFIRMED' && hasPermission('BOOKING_UPDATE') && (
        <Button variant="outline" size="sm" onClick={onCheckIn}>
          <LogIn className="h-3.5 w-3.5" /> Check in
        </Button>
      )}
      {booking.status === 'CHECKED_IN' && hasPermission('INVOICE_CREATE') && (
        <Button variant="brass" size="sm" onClick={onCheckOut}>
          <LogoutIcon className="h-3.5 w-3.5" /> Check out
        </Button>
      )}
      {booking.status === 'CONFIRMED' && hasPermission('BOOKING_UPDATE') && (
        <Button variant="ghost" size="sm" className="text-danger" onClick={onCancel}>
          <XCircle className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function BookingFormDialog({ booking, onDone }: { booking: Booking | null; onDone: () => void }) {
  const guestsQuery = useQuery({
    queryKey: ['guests-all'],
    queryFn: async () => {
      const res = await api.guests.list({ pageSize: 100 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
  const roomsQuery = useQuery({
    queryKey: ['rooms-list'],
    queryFn: async () => {
      const res = await api.rooms.list();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: BookingForm) => api.bookings.create(values),
    onSuccess: (_, values) => {
      toast.success('Booking created');
      onDone();
      void values;
    },
    onError: (err: Error) => toast.error('Booking failed', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: BookingForm }) =>
      api.bookings.update(id, values),
    onSuccess: () => {
      toast.success('Booking updated');
      onDone();
    },
    onError: (err: Error) => toast.error('Update failed', err.message),
  });

  const form = useForm<BookingForm>({
    resolver: zodResolver(bookingSchema),
    defaultValues: booking
      ? {
          guestId: booking.guestId,
          roomId: booking.roomId,
          checkInDate: booking.checkInDate.slice(0, 10),
          checkOutDate: booking.checkOutDate.slice(0, 10),
          adults: booking.adults,
          children: booking.children,
          roomRate: booking.roomRate,
          discountAmount: booking.discountAmount,
          advancePayment: booking.advancePayment,
          specialRequests: booking.specialRequests ?? '',
        }
      : {
          guestId: '',
          roomId: '',
          checkInDate: new Date().toISOString().slice(0, 10),
          checkOutDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          adults: 1,
          children: 0,
          roomRate: '',
          discountAmount: '0',
          advancePayment: '0',
          specialRequests: '',
        },
  });

  const rooms = roomsQuery.data ?? [];
  const selectedRoomId = form.watch('roomId');

  const onRoomChange = (roomId: string) => {
    form.setValue('roomId', roomId);
    const room = rooms.find((r) => r.id === roomId);
    if (room) {
      form.setValue('roomRate', room.price ?? room.roomType?.basePrice ?? '0');
      form.setValue('adults', Math.min(2, room.capacity ?? 2));
    }
  };

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <form
      className="grid grid-cols-2 gap-4"
      onSubmit={(e) => void form.handleSubmit((values) => {
        if (booking) updateMutation.mutate({ id: booking.id, values });
        else createMutation.mutate(values);
      })(e)}
    >
      <div className="col-span-2 space-y-1.5">
        <Label>Guest *</Label>
        <Select {...form.register('guestId')}>
          <option value="">Select guest…</option>
          {(guestsQuery.data?.items ?? []).map((g) => (
            <option key={g.id} value={g.id}>
              {g.fullName}{g.mobile ? ` (${g.mobile})` : ''}
            </option>
          ))}
        </Select>
        {form.formState.errors.guestId && (
          <p className="text-xs text-danger">{form.formState.errors.guestId.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Room *</Label>
        <Select {...form.register('roomId')} onChange={(e) => onRoomChange(e.target.value)}>
          <option value="">Select room…</option>
          {rooms
            .filter((r) => !booking || r.id === booking.roomId || r.status !== 'OCCUPIED')
            .map((r) => (
              <option key={r.id} value={r.id} disabled={r.status === 'OCCUPIED'}>
                {r.number} · {r.roomType?.name} · {r.status}
              </option>
            ))}
        </Select>
        {form.formState.errors.roomId && (
          <p className="text-xs text-danger">{form.formState.errors.roomId.message}</p>
        )}
      </div>
      {selectedRoomId === '' && null}

      <div className="space-y-1.5">
        <Label>Check-in *</Label>
        <Input type="date" {...form.register('checkInDate')} />
        {form.formState.errors.checkInDate && (
          <p className="text-xs text-danger">{form.formState.errors.checkInDate.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Check-out *</Label>
        <Input type="date" {...form.register('checkOutDate')} />
        {form.formState.errors.checkOutDate && (
          <p className="text-xs text-danger">{form.formState.errors.checkOutDate.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Adults *</Label>
        <Input type="number" min={1} {...form.register('adults')} />
      </div>
      <div className="space-y-1.5">
        <Label>Children</Label>
        <Input type="number" min={0} {...form.register('children')} />
      </div>
      <div className="space-y-1.5">
        <Label>Room rate (per night) *</Label>
        <Input type="number" step="0.01" {...form.register('roomRate')} />
      </div>
      <div className="space-y-1.5">
        <Label>Discount</Label>
        <Input type="number" step="0.01" {...form.register('discountAmount')} />
      </div>
      <div className="space-y-1.5">
        <Label>Advance payment</Label>
        <Input type="number" step="0.01" {...form.register('advancePayment')} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label>Special requests</Label>
        <Input {...form.register('specialRequests')} />
      </div>

      <div className="col-span-2 mt-2 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : booking ? 'Save changes' : 'Create booking'}
        </Button>
      </div>
    </form>
  );
}

const paymentMethodSchema = z.object({
  method: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
  amount: z.string().min(1),
  reference: z.string().optional(),
});

function CheckoutDialog({
  booking,
  onClose,
  onDone,
}: {
  booking: Booking;
  onClose: () => void;
  onDone: () => void;
}) {
  const folioQuery = useQuery({
    queryKey: ['folio', booking.id],
    queryFn: async () => {
      const res = await api.bookings.folio(booking.id);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const [discount, setDiscount] = useState('0');
  const [payments, setPayments] = useState<Array<{ method: string; amount: string }>>([
    { method: 'CASH', amount: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: (data: { discountAmount: string; payments: Array<{ method: string; amount: string }> }) =>
      api.bookings.checkOut(booking.id, data),
    onSuccess: (invoice) => {
      toast.success('Checked out', `Invoice ${invoice.invoiceNumber} generated`);
      onDone();
    },
    onError: (err: Error) => toast.error('Checkout failed', err.message),
  });

  const folio = folioQuery.data;
  const grandTotal = folio ? Number(folio.breakdown.grandTotal) : 0;
  const effectiveTotal = useMemo(
    () => (folio ? Math.max(0, grandTotal - Number(discount || '0')) : 0),
    [folio, grandTotal, discount],
  );
  const paidSum = payments.reduce((s, p) => s + Number(p.amount || '0'), 0);
  const due = Math.max(0, effectiveTotal - folio!.advance - paidSum);

  const submit = async () => {
    setSubmitting(true);
    try {
      await checkoutMutation.mutateAsync({
        discountAmount: discount,
        payments: payments.filter((p) => Number(p.amount) > 0),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent
      title={`Check out — ${booking.bookingNumber}`}
      description="Review the folio, apply discounts, record split payments."
      wide
    >
      {folioQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-paper" />
          ))}
        </div>
      ) : folioQuery.isError ? (
        <ErrorState message={(folioQuery.error as Error).message} />
      ) : (
        folio && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardTitle>Nights</CardTitle>
                <CardValue>{folio.nights}</CardValue>
              </Card>
              <Card>
                <CardTitle>Room rate</CardTitle>
                <CardValue>{formatCurrency(booking.roomRate)}</CardValue>
              </Card>
              <Card>
                <CardTitle>Open restaurant orders</CardTitle>
                <CardValue>{folio.openOrders.length}</CardValue>
              </Card>
            </div>

            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Rate</TH>
                  <TH className="text-right">Disc.</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {folio.items.map((i, idx) => (
                  <TR key={idx}>
                    <TD>{i.description}</TD>
                    <TD className="text-right">{i.quantity}</TD>
                    <TD className="text-right">{formatCurrency(i.unitPrice)}</TD>
                    <TD className="text-right">{formatCurrency(i.discountAmount)}</TD>
                    <TD className="text-right">{formatCurrency(i.quantity * i.unitPrice - i.discountAmount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Extra discount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payments (split allowed)</Label>
                  {payments.map((p, idx) => (
                    <div key={idx} className="flex gap-2">
                      <Select
                        value={p.method}
                        onChange={(e) => {
                          const next = [...payments];
                          next[idx] = { ...next[idx], method: e.target.value };
                          setPayments(next);
                        }}
                        className="w-40"
                      >
                        {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT', 'OTHER'].map((m) => (
                          <option key={m} value={m}>
                            {m.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={p.amount}
                        onChange={(e) => {
                          const next = [...payments];
                          next[idx] = { ...next[idx], amount: e.target.value };
                          setPayments(next);
                        }}
                      />
                      {payments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPayments(payments.filter((_, i) => i !== idx))}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPayments([...payments, { method: 'UPI', amount: '' }])}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add split payment
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5 rounded-xl border border-border bg-paper p-4 text-sm">
                <Line label="Subtotal" value={formatCurrency(folio.breakdown.subtotal)} />
                <Line label="Discount" value={`− ${formatCurrency(folio.breakdown.itemDiscount)}`} />
                <Line label="Taxable" value={formatCurrency(folio.breakdown.taxableAmount)} />
                {Number(folio.breakdown.cgst) > 0 && (
                  <Line label="CGST" value={formatCurrency(folio.breakdown.cgst)} />
                )}
                {Number(folio.breakdown.sgst) > 0 && (
                  <Line label="SGST" value={formatCurrency(folio.breakdown.sgst)} />
                )}
                {Number(folio.breakdown.igst) > 0 && (
                  <Line label="IGST" value={formatCurrency(folio.breakdown.igst)} />
                )}
                <Line label="Total tax" value={formatCurrency(folio.breakdown.totalTax)} />
                <Line
                  label="Grand total"
                  value={formatCurrency(effectiveTotal)}
                  strong
                />
                <Line label="Advance paid" value={formatCurrency(folio.advance)} />
                <Line label="Paying now" value={formatCurrency(paidSum)} />
                <div className="my-2 border-t border-border" />
                <Line
                  label="Due after checkout"
                  value={formatCurrency(due)}
                  strong
                  tone={due > 0 ? 'danger' : undefined}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                Back
              </Button>
              <Button
                variant="brass"
                disabled={submitting || checkoutMutation.isPending}
                onClick={() => void submit()}
              >
                <IndianRupee className="h-4 w-4" />
                {submitting ? 'Processing…' : 'Confirm checkout & generate invoice'}
              </Button>
            </div>
          </div>
        )
      )}
    </DialogContent>
  );
}

function Line({
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
      <span
        className={
          tone === 'danger'
            ? 'font-semibold text-danger'
            : strong
              ? 'font-semibold text-ink'
              : 'text-ink'
        }
      >
        {value}
      </span>
    </div>
  );
}

// Keep import used
void CalendarDays;
