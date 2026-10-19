import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Layers,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  type BillDetail,
  type DiningTable,
  type MenuCategory,
  type MenuItem,
  type TableInput,
} from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState, ErrorState } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { cn, formatCurrency } from '@/utils/cn';

export function TablesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManageTables = hasPermission('MENU_MANAGE');
  const canBill = hasPermission('BILL_CREATE');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableDialogOpen, setTableDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiningTable | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [createdBill, setCreatedBill] = useState<BillDetail | null>(null);

  const tablesQuery = useQuery({
    queryKey: ['tables', search, status],
    queryFn: async () => {
      const res = await api.tables.list({
        search: search || undefined,
        status: status || undefined,
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const tables = tablesQuery.data?.items ?? [];
  const selectedTable = tables.find((table) => table.id === selectedId) ?? null;

  const saveTableMutation = useMutation({
    mutationFn: async (values: TableFormValues) => {
      const payload: TableInput = {
        number: values.number.trim(),
        capacity: Number(values.capacity),
        floor: Number(values.floor),
      };
      const res = editingTable
        ? await api.tables.update(editingTable.id, { ...payload, isActive: values.isActive })
        : await api.tables.create(payload);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (table) => {
      toast.success(editingTable ? 'Table updated' : 'Table created', `Table ${table.number}`);
      setTableDialogOpen(false);
      setEditingTable(null);
      setSelectedId(table.id);
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Table could not be saved', err.message),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (count: number) => {
      const res = await api.tables.bulkCreate({ count });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (result) => {
      if (result.createdCount === 0) {
        toast.success(
          'No new tables',
          `Tables T1–T${result.requested} already exist.`,
        );
      } else {
        toast.success(
          `${result.createdCount} table${result.createdCount === 1 ? '' : 's'} created`,
          result.skippedCount > 0
            ? `${result.skippedCount} existing table${result.skippedCount === 1 ? '' : 's'} skipped.`
            : `Tables T1–T${result.requested} are ready.`,
        );
      }
      setBulkDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Tables could not be created', err.message),
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const res = await api.tables.remove(tableId);
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: (_data, tableId) => {
      toast.success('Table removed');
      if (selectedId === tableId) setSelectedId(null);
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Table could not be removed', err.message),
  });

  const invalidateBilling = () => {
    void queryClient.invalidateQueries({ queryKey: ['tables'] });
    void queryClient.invalidateQueries({ queryKey: ['bills'] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
  };

  const addItemMutation = useMutation({
    mutationFn: async ({ tableId, menuItemId }: { tableId: string; menuItemId: string }) => {
      const res = await api.tables.addItems(tableId, [{ menuItemId, quantity: '1' }]);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Item could not be added', err.message),
  });

  const removeItemMutation = useMutation({
    mutationFn: async ({ tableId, itemId }: { tableId: string; itemId: string }) => {
      const res = await api.tables.removeItem(tableId, itemId);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Item could not be removed', err.message),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (tableId: string) => {
      const res = await api.tables.cancel(tableId);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (table) => {
      toast.success('Open bill voided', `Table ${table.number} is available again.`);
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: Error) => toast.error('Open bill could not be voided', err.message),
  });

  const checkoutMutation = useMutation({
    mutationFn: async (values: CheckoutFormValues & { clientRequestId: string }) => {
      if (!selectedTable) throw new Error('Select a table first');
      const res = await api.tables.checkout(selectedTable.id, {
        clientRequestId: values.clientRequestId,
        customerName: values.customerName.trim() || undefined,
        customerMobile: values.customerMobile.trim() || undefined,
        notes: values.notes.trim() || undefined,
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (bill) => {
      setCheckoutOpen(false);
      setCreatedBill(bill);
      toast.success('Bill generated', `${bill.billNumber} · ${formatCurrency(bill.grandTotal)}`);
      invalidateBilling();
    },
    onError: (err: Error) => toast.error('Bill could not be generated', err.message),
  });

  const openCreateTable = () => {
    setEditingTable(null);
    setTableDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Tables</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manage tables and keep an independent running bill on each one.
          </p>
        </div>
        {canManageTables && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
              <Layers className="h-4 w-4" /> Bulk add tables
            </Button>
            <Button onClick={openCreateTable}>
              <Plus className="h-4 w-4" /> Add table
            </Button>
          </div>
        )}
      </div>

      {tablesQuery.isError && <ErrorState message={(tablesQuery.error as Error).message} />}

      {createdBill && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm">
          <span>
            Bill <strong>{createdBill.billNumber}</strong> generated for{' '}
            {formatCurrency(createdBill.grandTotal)} and marked paid. The table is free.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCreatedBill(null)}>
              Dismiss
            </Button>
            <Button size="sm" onClick={() => navigate('/invoices')}>
              View bills
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
              <Input
                className="pl-9"
                placeholder="Search table number"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select
              className="w-48"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All tables</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied / open bill</option>
            </Select>
          </div>

          {tablesQuery.isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3].map((key) => (
                <div
                  key={key}
                  className="h-40 animate-pulse rounded-xl border border-border bg-paper-elevated"
                />
              ))}
            </div>
          ) : tables.length === 0 ? (
            <EmptyState
              title="No tables yet"
              description={
                canManageTables
                  ? 'Create your dining tables, then start a separate bill on each one.'
                  : 'Ask an administrator to create the dining tables.'
              }
              action={
                canManageTables ? <Button onClick={openCreateTable}>Add table</Button> : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  selected={table.id === selectedId}
                  canManage={canManageTables}
                  onSelect={() => setSelectedId(table.id)}
                  onEdit={() => {
                    setEditingTable(table);
                    setTableDialogOpen(true);
                  }}
                  onDelete={async () => {
                    const confirmed = await confirmDialog({
                      title: `Remove table ${table.number}`,
                      message:
                        'The table is archived. A table with an open bill must be billed or voided first.',
                      confirmLabel: 'Remove table',
                      danger: true,
                    });
                    if (confirmed) deleteTableMutation.mutate(table.id);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="flex max-h-[calc(100vh-11rem)] flex-col rounded-xl border border-border bg-paper-elevated">
          {!selectedTable ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <ReceiptText className="h-7 w-7 text-ink-muted" />
              <div>
                <p className="font-medium text-ink">Select a table</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Choose a table to add food items or settle its bill.
                </p>
              </div>
            </div>
          ) : (
            <TableBillPanel
              table={selectedTable}
              canBill={canBill}
              addingItem={addItemMutation.isPending}
              removingItemId={
                removeItemMutation.isPending ? removeItemMutation.variables?.itemId ?? null : null
              }
              voiding={cancelOrderMutation.isPending}
              onAddItem={(menuItemId) =>
                addItemMutation.mutate({ tableId: selectedTable.id, menuItemId })
              }
              onRemoveItem={(itemId) =>
                removeItemMutation.mutate({ tableId: selectedTable.id, itemId })
              }
              onCheckout={() => {
                setCreatedBill(null);
                setCheckoutOpen(true);
              }}
              onVoid={async () => {
                const confirmed = await confirmDialog({
                  title: `Void bill for table ${selectedTable.number}`,
                  message:
                    'All unbilled items on this table will be discarded and the table will be freed. No invoice is created.',
                  confirmLabel: 'Void open bill',
                  danger: true,
                });
                if (confirmed) cancelOrderMutation.mutate(selectedTable.id);
              }}
            />
          )}
        </aside>
      </div>

      <Dialog open={tableDialogOpen} onOpenChange={setTableDialogOpen}>
        {tableDialogOpen && (
          <DialogContent
            title={editingTable ? `Edit table ${editingTable.number}` : 'Add table'}
            description="Table numbers are unique. Each table keeps its own running bill."
          >
            <TableForm
              key={editingTable?.id ?? 'new'}
              table={editingTable}
              saving={saveTableMutation.isPending}
              onCancel={() => setTableDialogOpen(false)}
              onSubmit={(values) => saveTableMutation.mutate(values)}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        {bulkDialogOpen && (
          <DialogContent
            title="Add tables in bulk"
            description="Enter how many tables you need. They are named T1, T2, T3 and so on."
          >
            <BulkTableForm
              saving={bulkCreateMutation.isPending}
              onCancel={() => setBulkDialogOpen(false)}
              onSubmit={(count) => bulkCreateMutation.mutate(count)}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        {checkoutOpen && selectedTable?.openBill && (
          <DialogContent
            title={`Generate bill · Table ${selectedTable.number}`}
            description="This creates a separate paid bill for this table and frees it for the next customer."
          >
            <CheckoutForm
              table={selectedTable}
              saving={checkoutMutation.isPending}
              onCancel={() => setCheckoutOpen(false)}
              onSubmit={(values) => checkoutMutation.mutate(values)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function TableCard({
  table,
  selected,
  canManage,
  onSelect,
  onEdit,
  onDelete,
}: {
  table: DiningTable;
  selected: boolean;
  canManage: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const occupied = table.status === 'OCCUPIED';
  return (
    <Card
      className={cn(
        'cursor-pointer transition hover:border-brass/60',
        selected && 'border-brass ring-2 ring-brass/30',
      )}
    >
      <div onClick={onSelect} className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Table</p>
            <h2 className="font-display text-2xl text-forest-deep">{table.number}</h2>
          </div>
          <StatusBadge status={table.status} />
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {table.capacity} seats
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> Floor {table.floor}
          </span>
        </div>

        {occupied && table.openBill ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium text-amber-950">
              {table.openBill.itemCount} item{table.openBill.itemCount === 1 ? '' : 's'} ·{' '}
              {table.openBill.orderNumber}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-amber-950">
              {formatCurrency(table.openBill.total)} running total
            </p>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-ink-muted">
            {table.isActive ? 'No open bill' : 'Table is inactive'}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <Button
          size="sm"
          variant={occupied ? 'brass' : 'outline'}
          disabled={!table.isActive && !occupied}
          onClick={onSelect}
        >
          {!table.isActive && !occupied ? 'Inactive' : occupied ? 'Manage bill' : 'Start bill'}
        </Button>
        {canManage && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit table ${table.number}`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove table ${table.number}`}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function TableBillPanel({
  table,
  canBill,
  addingItem,
  removingItemId,
  voiding,
  onAddItem,
  onRemoveItem,
  onCheckout,
  onVoid,
}: {
  table: DiningTable;
  canBill: boolean;
  addingItem: boolean;
  removingItemId: string | null;
  voiding: boolean;
  onAddItem: (menuItemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onCheckout: () => void;
  onVoid: () => void;
}) {
  const [menuSearch, setMenuSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const menuQuery = useQuery({
    queryKey: ['menu', menuSearch, categoryId, 'available'],
    queryFn: async () => {
      const res = await api.menu.list({
        search: menuSearch || undefined,
        categoryId: categoryId || undefined,
        available: 'true',
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const categories: MenuCategory[] = menuQuery.data?.categories ?? [];
  const items: MenuItem[] = menuQuery.data?.items ?? [];
  const bill = table.openBill;
  const occupied = table.status === 'OCCUPIED';

  return (
    <>
      <div className="border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Table</p>
            <h2 className="font-display text-2xl text-forest-deep">{table.number}</h2>
          </div>
          <StatusBadge status={table.status} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {table.capacity} seats · Floor {table.floor}
          {bill ? ` · Opened ${new Date(bill.openedAt).toLocaleTimeString('en-IN')}` : ''}
        </p>
        {bill && (
          <p className="mt-1 text-xs text-ink-muted">
            {bill.orderNumber}
            {bill.createdBy ? ` · ${bill.createdBy}` : ''}
          </p>
        )}
      </div>

      <div className="min-h-32 flex-1 space-y-2 overflow-y-auto border-b border-border p-4">
        {!bill || bill.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {occupied ? 'This table has no items yet.' : 'Add items below to start this table’s bill.'}
          </p>
        ) : (
          bill.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-paper p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className="text-xs text-ink-muted">
                  {item.quantity} × {formatCurrency(item.unitPrice)}
                </p>
              </div>
              <span className="text-sm font-medium">{formatCurrency(item.lineTotal)}</span>
              {canBill && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Remove ${item.name} from table ${table.number}`}
                  disabled={removingItemId === item.id}
                  onClick={() => onRemoveItem(item.id)}
                >
                  <X className="h-4 w-4 text-danger" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {bill && bill.items.length > 0 && (
        <div className="space-y-1 border-b border-border px-4 py-3 text-sm">
          <BillAmount label="Subtotal" value={bill.subtotal} />
          <BillAmount label="Tax" value={bill.tax} />
          <BillAmount label="Total" value={bill.total} strong />
        </div>
      )}

      <div className="border-b border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-forest-deep">Add food items</h3>
          <span className="text-xs text-ink-muted">{items.length} available</span>
        </div>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
            <Input
              className="pl-9"
              placeholder="Search menu"
              value={menuSearch}
              onChange={(event) => setMenuSearch(event.target.value)}
            />
          </div>
          <Select
            className="w-32"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
          {menuQuery.isLoading ? (
            <div className="h-20 animate-pulse rounded-lg bg-paper" />
          ) : items.length === 0 ? (
            <p className="py-3 text-center text-sm text-ink-muted">No available menu items.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-paper px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink-muted">
                    {item.categoryName} · {formatCurrency(item.price)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canBill || addingItem}
                  onClick={() => onAddItem(item.id)}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="space-y-2 p-4">
        <Button
          className="w-full"
          disabled={!canBill || !bill || bill.items.length === 0}
          onClick={onCheckout}
        >
          <CheckCircle2 className="h-4 w-4" />
          Generate bill &amp; free table
        </Button>
        {bill && (
          <Button
            className="w-full"
            variant="outline"
            disabled={!canBill || voiding}
            onClick={onVoid}
          >
            <Ban className="h-4 w-4" /> Void open bill
          </Button>
        )}
        {!canBill && (
          <p className="text-center text-xs text-ink-muted">
            You need billing permission to add items or settle this table.
          </p>
        )}
      </div>
    </>
  );
}

function BillAmount({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between',
        strong ? 'border-t border-border pt-1 font-semibold text-ink' : 'text-ink-muted',
      )}
    >
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  );
}

interface TableFormValues {
  number: string;
  capacity: string;
  floor: string;
  isActive: boolean;
}

function TableForm({
  table,
  saving,
  onCancel,
  onSubmit,
}: {
  table: DiningTable | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: TableFormValues) => void;
}) {
  const [number, setNumber] = useState(table?.number ?? '');
  const [capacity, setCapacity] = useState(String(table?.capacity ?? 4));
  const [floor, setFloor] = useState(String(table?.floor ?? 1));
  const [isActive, setIsActive] = useState(table?.isActive ?? true);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ number, capacity, floor, isActive });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="table-number">Table number</Label>
        <Input
          id="table-number"
          required
          maxLength={20}
          placeholder="e.g. 4"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="table-capacity">Capacity</Label>
          <Input
            id="table-capacity"
            type="number"
            min={1}
            max={100}
            required
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="table-floor">Floor</Label>
          <Input
            id="table-floor"
            type="number"
            min={0}
            max={100}
            required
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
          />
        </div>
      </div>
      {table && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active — available for new orders
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !number.trim()}>
          {saving ? 'Saving…' : table ? 'Save table' : 'Create table'}
        </Button>
      </div>
    </form>
  );
}

function BulkTableForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (count: number) => void;
}) {
  const [count, setCount] = useState('10');
  const parsed = Number(count);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 200;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) onSubmit(parsed);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bulk-table-count">Number of tables</Label>
        <Input
          id="bulk-table-count"
          type="number"
          min={1}
          max={200}
          step={1}
          required
          value={count}
          onChange={(event) => setCount(event.target.value)}
        />
      </div>
      <p className="rounded-lg border border-border bg-paper px-3 py-2 text-xs text-ink-muted">
        {valid ? (
          <>
            This creates <strong className="text-ink">T1</strong> through{' '}
            <strong className="text-ink">T{parsed}</strong>. Tables that already exist are
            skipped, so it is safe to run again.
          </>
        ) : (
          'Enter a whole number between 1 and 200.'
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !valid}>
          {saving ? 'Creating…' : 'Create tables'}
        </Button>
      </div>
    </form>
  );
}

interface CheckoutFormValues {
  customerName: string;
  customerMobile: string;
  notes: string;
}

function CheckoutForm({
  table,
  saving,
  onCancel,
  onSubmit,
}: {
  table: DiningTable;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: CheckoutFormValues & { clientRequestId: string }) => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [notes, setNotes] = useState('');
  const requestId = useRef<string | null>(null);
  const bill = table.openBill;
  const summary = useMemo(
    () => (bill ? { items: bill.itemCount, total: bill.total } : { items: 0, total: '0.00' }),
    [bill],
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!requestId.current) requestId.current = crypto.randomUUID();
        onSubmit({
          customerName,
          customerMobile,
          notes,
          clientRequestId: requestId.current,
        });
      }}
    >
      <div className="rounded-lg border border-border bg-paper px-3 py-2 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">Items</span>
          <span>{summary.items}</span>
        </div>
        <div className="mt-1 flex justify-between font-semibold text-ink">
          <span>Total</span>
          <span>{formatCurrency(summary.total)}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checkout-name">Customer name</Label>
        <Input
          id="checkout-name"
          maxLength={120}
          placeholder="Walk-in customer"
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checkout-mobile">Mobile</Label>
        <Input
          id="checkout-mobile"
          maxLength={20}
          placeholder="Optional"
          value={customerMobile}
          onChange={(event) => setCustomerMobile(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="checkout-notes">Notes</Label>
        <Input
          id="checkout-notes"
          maxLength={500}
          placeholder="Optional"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <p className="text-xs text-ink-muted">
        The server recalculates tax and totals from the ordered item snapshots and creates this
        table’s own paid bill.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !bill || bill.items.length === 0}>
          {saving ? 'Generating…' : 'Generate bill'}
        </Button>
      </div>
    </form>
  );
}
