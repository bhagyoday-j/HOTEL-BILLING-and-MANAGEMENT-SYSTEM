import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type MenuCategory, type MenuItem } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/cn';

interface CartLine {
  item: MenuItem;
  quantity: number;
}

export function RestaurantPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [createdBillNumber, setCreatedBillNumber] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManageMenu = hasPermission('MENU_MANAGE');
  const canCreateBill = hasPermission('BILL_CREATE');

  const menuQuery = useQuery({
    queryKey: ['menu', search, categoryId],
    queryFn: async () => {
      const res = await api.menu.list({ search: search || undefined, categoryId: categoryId || undefined });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const saveItemMutation = useMutation({
    mutationFn: async (values: ItemFormValues) => {
      const res = editingItem
        ? await api.menu.updateItem(editingItem.id, values)
        : await api.menu.createItem(values);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success(editingItem ? 'Menu item updated' : 'Menu item created');
      setItemDialogOpen(false);
      setEditingItem(null);
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
    onError: (err: Error) => toast.error('Menu item could not be saved', err.message),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.menu.createCategory(name);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Menu category created');
      setCategoryDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
    onError: (err: Error) => toast.error('Category could not be created', err.message),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await api.menu.deleteItem(itemId);
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success('Menu item archived');
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
    onError: (err: Error) => toast.error('Menu item could not be archived', err.message),
  });

  const createBillMutation = useMutation({
    mutationFn: async () => {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const res = await api.bills.create({
        clientRequestId: requestId.current,
        customerName: customerName.trim() || undefined,
        customerMobile: customerMobile.trim() || undefined,
        items: cart.map(({ item, quantity }) => ({
          menuItemId: item.id,
          quantity: String(quantity),
        })),
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (bill) => {
      requestId.current = null;
      setCart([]);
      setCustomerName('');
      setCustomerMobile('');
      setCreatedBillNumber(bill.billNumber);
      toast.success('Bill created', bill.billNumber);
      void queryClient.invalidateQueries({ queryKey: ['bills'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    },
    onError: (err: Error) => toast.error('Bill could not be created', err.message),
  });

  const items = menuQuery.data?.items ?? [];
  const categories = menuQuery.data?.categories ?? [];
  const selectedCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

  const addItem = (item: MenuItem) => {
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      return existing
        ? current.map((line) =>
            line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [...current, { item, quantity: 1 }];
    });
    setCreatedBillNumber(null);
  };

  const changeQuantity = (itemId: string, quantity: number) => {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.item.id !== itemId)
        : current.map((line) => (line.item.id === itemId ? { ...line, quantity } : line)),
    );
  };

  const openCreateItem = () => {
    setEditingItem(null);
    setItemDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Menu & Billing</h1>
          <p className="mt-1 text-sm text-ink-muted">Choose menu items, then create a customer bill.</p>
        </div>
        {canManageMenu && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setCategoryDialogOpen(true)}>Add category</Button>
            <Button onClick={openCreateItem}><Plus className="h-4 w-4" /> Add menu item</Button>
          </div>
        )}
      </div>

      {menuQuery.isError && <ErrorState message={(menuQuery.error as Error).message} />}
      {createdBillNumber && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm">
          <span>Bill <strong>{createdBillNumber}</strong> was created and marked paid.</span>
          <Button size="sm" variant="outline" onClick={() => navigate('/invoices')}>View bills</Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
              <Input
                className="pl-9"
                placeholder="Search menu"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select className="w-56" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="">All categories</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </Select>
          </div>

          {items.length === 0 ? (
            !menuQuery.isLoading && (
              <EmptyState
                title="No menu items"
                description={canManageMenu ? 'Add a menu item to start billing.' : 'Ask an administrator to add menu items.'}
                action={canManageMenu ? <Button onClick={openCreateItem}>Add menu item</Button> : undefined}
              />
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id} className="flex min-h-36 flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{item.categoryName ?? categories.find((c) => c.id === item.categoryId)?.name}</CardTitle>
                      <h2 className="mt-1 font-medium text-ink">{item.name}</h2>
                      {item.description && <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{item.description}</p>}
                    </div>
                    {!item.isAvailable && <span className="text-xs text-danger">Unavailable</span>}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-semibold text-forest-deep">{formatCurrency(item.price)}</span>
                    <div className="flex gap-1">
                      {canManageMenu && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Archive ${item.name}`}
                            disabled={deleteItemMutation.isPending}
                            onClick={async () => {
                              const confirmed = await confirmDialog({
                                title: 'Archive menu item',
                                message: `Archive ${item.name}? Existing bills keep their original item details.`,
                                confirmLabel: 'Archive item',
                                danger: true,
                              });
                              if (confirmed) deleteItemMutation.mutate(item.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-danger" />
                          </Button>
                        </>
                      )}
                      <Button size="sm" disabled={!item.isAvailable || !canCreateBill} onClick={() => addItem(item)}>
                        <Plus className="h-4 w-4" /> Add
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col rounded-xl border border-border bg-paper-elevated">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold text-forest-deep">Current bill</h2>
            <p className="mt-1 text-xs text-ink-muted">{selectedCount} item{selectedCount === 1 ? '' : 's'}</p>
          </div>
          <div className="space-y-3 border-b border-border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="bill-customer-name">Customer name</Label>
              <Input id="bill-customer-name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-customer-mobile">Mobile</Label>
              <Input id="bill-customer-mobile" value={customerMobile} onChange={(event) => setCustomerMobile(event.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="min-h-28 flex-1 space-y-2 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">Add items from the menu to begin.</p>
            ) : cart.map(({ item, quantity }) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border bg-paper p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink-muted">{formatCurrency(item.price)} each</p>
                </div>
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label={`Decrease ${item.name}`} onClick={() => changeQuantity(item.id, quantity - 1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-5 text-center text-sm">{quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label={`Increase ${item.name}`} onClick={() => changeQuantity(item.id, quantity + 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-4">
            <p className="mb-3 text-xs text-ink-muted">The server calculates tax and totals from current menu prices. Bills are finalized as paid.</p>
            <Button
              className="w-full"
              disabled={!canCreateBill || cart.length === 0 || createBillMutation.isPending}
              onClick={() => createBillMutation.mutate()}
            >
              {createBillMutation.isPending ? 'Creating bill…' : 'Create bill'}
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        {itemDialogOpen && (
          <DialogContent
            title={editingItem ? 'Edit menu item' : 'Add menu item'}
            description="Menu prices and tax rates are applied by the server when the bill is created."
          >
            <ItemForm
              key={editingItem?.id ?? 'new'}
              item={editingItem}
              categories={categories}
              saving={saveItemMutation.isPending}
              onCancel={() => setItemDialogOpen(false)}
              onSubmit={(values) => saveItemMutation.mutate(values)}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        {categoryDialogOpen && (
          <DialogContent title="Add menu category" description="Create a category for menu items.">
            <CategoryForm
              saving={createCategoryMutation.isPending}
              onCancel={() => setCategoryDialogOpen(false)}
              onSubmit={(name) => createCategoryMutation.mutate(name)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

interface ItemFormValues {
  name: string;
  sku: string;
  categoryId: string;
  price: string;
  taxRate: string;
  description: string;
  isAvailable: boolean;
}

function ItemForm({
  item,
  categories,
  saving,
  onCancel,
  onSubmit,
}: {
  item: MenuItem | null;
  categories: MenuCategory[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ItemFormValues) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? categories[0]?.id ?? '');
  const [price, setPrice] = useState(item?.price ?? '');
  const [taxRate, setTaxRate] = useState(item?.taxRate ?? '0');
  const [description, setDescription] = useState(item?.description ?? '');
  const [isAvailable, setIsAvailable] = useState(item?.isAvailable ?? true);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ name, sku, categoryId, price, taxRate, description, isAvailable });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="menu-item-name">Name</Label>
        <Input id="menu-item-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="menu-item-category">Category</Label>
          <Select id="menu-item-category" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="" disabled>Select category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-item-sku">SKU</Label>
          <Input id="menu-item-sku" maxLength={40} value={sku ?? ''} onChange={(event) => setSku(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-item-price">Price</Label>
          <Input id="menu-item-price" type="number" min="0.01" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="menu-item-tax">Tax rate (%)</Label>
          <Input id="menu-item-tax" type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="menu-item-description">Description</Label>
        <Input id="menu-item-description" maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} />
        Available for billing
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving || categories.length === 0}>{saving ? 'Saving…' : 'Save item'}</Button>
      </div>
    </form>
  );
}

function CategoryForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name.trim());
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="menu-category-name">Category name</Label>
        <Input id="menu-category-name" required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create category'}</Button>
      </div>
    </form>
  );
}
