import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Minus, Trash2, Send, CreditCard, XCircle, ClipboardList, Layers,
} from 'lucide-react';
import { api, type MenuItem, type RestaurantOrder } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/table';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency, cn } from '@/utils/cn';

interface CartLine {
  menuItemId: string;
  name: string;
  price: string;
  taxRate: string;
  quantity: number;
}

export function RestaurantPage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY' | 'ROOM_SERVICE'>('DINE_IN');
  const [tableId, setTableId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [discount, setDiscount] = useState('0');
  const [payingOrder, setPayingOrder] = useState<RestaurantOrder | null>(null);
  const queryClient = useQueryClient();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const menuQuery = useQuery({
    queryKey: ['restaurant-menu'],
    queryFn: async () => {
      const res = await api.restaurant.menu();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const tablesQuery = useQuery({
    queryKey: ['restaurant-tables'],
    queryFn: async () => {
      const res = await api.restaurant.tables();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const activeStaysQuery = useQuery({
    queryKey: ['bookings-active'],
    queryFn: async () => {
      const res = await api.bookings.list({ status: 'CHECKED_IN', pageSize: 100 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: orderType === 'ROOM_SERVICE',
  });

  const openOrdersQuery = useQuery({
    queryKey: ['restaurant-orders-open'],
    queryFn: async () => {
      const res = await api.restaurant.orders({ pageSize: 50 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const createOrderMutation = useMutation({
    mutationFn: () => {
      const items = cart.map((c) => ({
        menuItemId: c.menuItemId,
        quantity: String(c.quantity),
      }));
      if (orderType === 'DINE_IN') {
        return api.restaurant.createOrder({ orderType, tableId, items, orderDiscountAmount: discount });
      }
      if (orderType === 'ROOM_SERVICE') {
        return api.restaurant.createOrder({ orderType, bookingId, items, orderDiscountAmount: discount, guestName });
      }
      return api.restaurant.createOrder({ orderType, guestName: guestName || 'Takeaway', items, orderDiscountAmount: discount });
    },
    onSuccess: (order) => {
      toast.success(`Order ${order.orderNumber} sent to kitchen`, `KOT ${order.kotNumber}`);
      setCart([]);
      setDiscount('0');
      setGuestName('');
      void queryClient.invalidateQueries({ queryKey: ['restaurant-orders-open'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
      // Offer KOT print
      void printKot(order.id);
    },
    onError: (err: Error) => toast.error('Order failed', err.message),
  });

  const printKot = async (orderId: string) => {
    const res = await api.restaurant.getOrder(orderId);
    if (!res.success) return;
    const order = res.data;
    await api.print.kot({
      data: {
        kotNumber: order.kotNumber,
        orderNumber: order.orderNumber,
        tableName: order.table?.name,
        roomNumber: order.room?.number,
        orderType: order.orderType,
        createdAt: order.createdAt,
        hotelName: 'Hotel',
        items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, notes: i.notes })),
      },
    });
  };

  const categories = menuQuery.data ?? [];
  const items = useMemo(() => {
    if (!activeCategory) return categories.flatMap((c) => c.items);
    return categories.find((c) => c.id === activeCategory)?.items ?? [];
  }, [categories, activeCategory]);

  const cartTotals = useMemo(() => {
    const gross = cart.reduce((s, c) => s + Number(c.price) * c.quantity, 0);
    const discountNum = Number(discount || '0');
    const taxable = Math.max(0, gross - discountNum);
    const tax = cart.reduce((s, c) => {
      const lineGross = Number(c.price) * c.quantity;
      return s + (lineGross * Number(c.taxRate)) / 100;
    }, 0);
    const scaledTax = gross > 0 ? tax * (taxable / gross) : 0;
    return { gross, taxable, tax: scaledTax, total: taxable + scaledTax };
  }, [cart, discount]);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, price: item.price, taxRate: item.taxRate, quantity: 1 },
      ];
    });
  };

  const setQty = (menuItemId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.menuItemId !== menuItemId));
    } else {
      setCart((prev) =>
        prev.map((c) => (c.menuItemId === menuItemId ? { ...c, quantity: qty } : c)),
      );
    }
  };

  const canSubmit =
    cart.length > 0 &&
    (orderType === 'DINE_IN' ? tableId !== '' : orderType === 'ROOM_SERVICE' ? bookingId !== '' : true) &&
    hasPermission('RESTAURANT_ORDER_CREATE');

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Restaurant POS</h1>
          <p className="mt-1 text-sm text-ink-muted">Point of sale · Kitchen order tickets</p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: categories + tables */}
        <div className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Categories</p>
            <button
              type="button"
              onClick={() => setActiveCategory(null)}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                activeCategory === null
                  ? 'border-brass bg-brass/10 text-ink'
                  : 'border-border bg-paper-elevated text-ink-muted hover:border-brass/40',
              )}
            >
              All items
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left text-sm transition',
                  activeCategory === c.id
                    ? 'border-brass bg-brass/10 text-ink'
                    : 'border-border bg-paper-elevated text-ink-muted hover:border-brass/40',
                )}
              >
                {c.name} <span className="text-xs">({c.items.length})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Center: menu items */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {menuQuery.isError && <ErrorState message={(menuQuery.error as Error).message} />}
          {menuQuery.isLoading ? (
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-paper-elevated" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="No menu items" description="Add menu items to start taking orders." />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.isAvailable}
                  onClick={() => addToCart(item)}
                  className={cn(
                    'rounded-xl border border-border bg-paper-elevated p-3 text-left transition hover:border-brass/60 hover:shadow-sm disabled:opacity-40',
                  )}
                >
                  <div className="text-sm font-medium text-ink">{item.name}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-sm text-forest-deep">{formatCurrency(item.price)}</span>
                    {!item.isAvailable && <span className="text-[10px] text-danger">SOLD OUT</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: cart */}
        <div className="flex w-96 shrink-0 flex-col rounded-2xl border border-border bg-paper-elevated">
          <div className="border-b border-border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg text-forest-deep">Current Order</h2>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" className="text-danger" onClick={() => setCart([])}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear
                </Button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(['DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={cn(
                    'rounded-lg border px-2 py-1.5 text-xs font-medium transition',
                    orderType === t
                      ? 'border-brass bg-brass/10 text-ink'
                      : 'border-border text-ink-muted hover:border-brass/40',
                  )}
                >
                  {t === 'DINE_IN' ? 'Dine-in' : t === 'TAKEAWAY' ? 'Takeaway' : 'Room service'}
                </button>
              ))}
            </div>
            {orderType === 'DINE_IN' && (
              <div className="mt-3 space-y-1.5">
                <Label>Table</Label>
                <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
                  <option value="">Select table…</option>
                  {(tablesQuery.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.status} · {t.capacity} seats
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {orderType === 'ROOM_SERVICE' && (
              <div className="mt-3 space-y-1.5">
                <Label>Active stay</Label>
                <Select
                  value={bookingId}
                  onChange={(e) => setBookingId(e.target.value)}
                >
                  <option value="">Select room…</option>
                  {(activeStaysQuery.data?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      Room {b.room.number} · {b.guest.fullName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {orderType !== 'DINE_IN' && (
              <div className="mt-3 space-y-1.5">
                <Label>Guest name</Label>
                <Input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder={orderType === 'ROOM_SERVICE' ? 'From stay' : 'Optional'}
                  disabled={orderType === 'ROOM_SERVICE'}
                />
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                Tap menu items to add them to the order
              </p>
            ) : (
              <div className="space-y-2">
                {cart.map((c) => (
                  <div key={c.menuItemId} className="flex items-center gap-2 rounded-lg border border-border bg-paper p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-ink-muted">
                        {formatCurrency(c.price)} × {c.quantity}
                      </div>
                    </div>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(c.menuItemId, c.quantity - 1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-semibold">{c.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setQty(c.menuItemId, c.quantity + 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <span className="w-20 text-right text-sm font-medium">
                      {formatCurrency(Number(c.price) * c.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border p-4">
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0">Discount</Label>
              <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-ink-muted">
                <span>Gross</span>
                <span>{formatCurrency(cartTotals.gross)}</span>
              </div>
              <div className="flex justify-between text-ink-muted">
                <span>Tax (est.)</span>
                <span>{formatCurrency(cartTotals.tax)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold text-ink">
                <span>Total</span>
                <span>{formatCurrency(cartTotals.total)}</span>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!canSubmit || createOrderMutation.isPending}
              onClick={() => createOrderMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              {createOrderMutation.isPending ? 'Sending…' : 'Send to kitchen (KOT)'}
            </Button>
          </div>
        </div>
      </div>

      {/* Open orders list */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">Open orders</h2>
        {(openOrdersQuery.data?.items ?? []).filter((o) => !['COMPLETED', 'CHARGED_TO_ROOM', 'CANCELLED'].includes(o.status)).length === 0 ? (
          <EmptyState title="No open orders" />
        ) : (
          <div className="grid grid-cols-4 gap-3">
            {(openOrdersQuery.data?.items ?? [])
              .filter((o) => !['COMPLETED', 'CHARGED_TO_ROOM', 'CANCELLED'].includes(o.status))
              .map((o) => (
                <Card key={o.id} className="cursor-pointer transition hover:border-brass/50" >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-ink-muted">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="mt-2 text-sm text-ink">
                    {o.table?.name ?? o.room?.number ? `Room ${o.room?.number}` : o.guestName ?? '—'}
                  </div>
                  <div className="mt-1 text-lg font-semibold text-forest-deep">
                    {formatCurrency(o.grandTotal)}
                  </div>
                  <div className="mt-3 flex gap-1">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPayingOrder(o)}>
                      <CreditCard className="h-3.5 w-3.5" /> Pay
                    </Button>
                    {hasPermission('RESTAURANT_ORDER_CREATE') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={async () => {
                          if (
                            await confirmDialog({
                              title: 'Cancel order',
                              message: `Cancel order ${o.orderNumber}? This cannot be undone.`,
                              confirmLabel: 'Cancel order',
                              danger: true,
                            })
                          ) {
                            const res = await api.restaurant.cancelOrder(o.id, 'Cancelled from POS');
                            if (res.success) {
                              toast.success('Order cancelled');
                              void queryClient.invalidateQueries({ queryKey: ['restaurant-orders-open'] });
                              void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
                            } else {
                              toast.error('Cancel failed', res.error.message);
                            }
                          }
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={payingOrder !== null} onOpenChange={(o) => !o && setPayingOrder(null)}>
        {payingOrder && (
          <PayOrderDialog
            order={payingOrder}
            onClose={() => setPayingOrder(null)}
            onPaid={() => {
              setPayingOrder(null);
              void queryClient.invalidateQueries({ queryKey: ['restaurant-orders-open'] });
              void queryClient.invalidateQueries({ queryKey: ['restaurant-tables'] });
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function PayOrderDialog({
  order,
  onClose,
  onPaid,
}: {
  order: RestaurantOrder;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState(order.grandTotal);
  const [discount, setDiscount] = useState('0');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const payMutation = useMutation({
    mutationFn: () =>
      api.restaurant.payOrder(order.id, {
        payments: [{ method, amount, reference: reference || undefined }],
        orderDiscountAmount: discount,
      }),
    onSuccess: (inv) => {
      toast.success('Payment recorded', `Invoice ${inv.invoiceNumber}`);
      onPaid();
    },
    onError: (err: Error) => toast.error('Payment failed', err.message),
  });

  const paid = Number(amount || '0');
  const total = Math.max(0, Number(order.grandTotal) - Number(discount || '0'));

  return (
    <DialogContent title={`Pay ${order.orderNumber}`} description="Collect payment and print receipt.">
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-paper p-4">
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Items</span>
            <span>{order.items.length}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-ink-muted">Order total</span>
            <span>{formatCurrency(order.grandTotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-base font-semibold">
            <span>Amount due</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Discount</Label>
            <Input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference (UPI/card)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={submitting || paid + 0.001 < total}
            onClick={() => {
              setSubmitting(true);
              payMutation.mutate();
            }}
          >
            <CreditCard className="h-4 w-4" />
            {submitting ? 'Processing…' : 'Record payment'}
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
