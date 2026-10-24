import type { ApiResponse, LicenseStatus, SessionUser } from '@hotel-billing/shared';
import { useAuthStore } from '@/stores/authStore';

function resolveApiBase(): string {
  const candidates = [
    import.meta.env.VITE_API_URL,
    'http://127.0.0.1:3847',
    'http://localhost:3847',
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/\/+$/, ''));

  return candidates[0] ?? 'http://127.0.0.1:3847';
}

const API_BASE = resolveApiBase();

function bridge() {
  if (typeof window === 'undefined' || !window.api) return null;
  return window.api;
}

function clearExpiredSession(response: unknown): void {
  if (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === false &&
    'error' in response &&
    typeof response.error === 'object' &&
    response.error !== null &&
    'code' in response.error &&
    response.error.code === 'UNAUTHENTICATED'
  ) {
    useAuthStore.getState().logout();
  }
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function http<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(init?.headers ?? {}),
      },
    });
    const response = (await res.json()) as ApiResponse<T>;
    clearExpiredSession(response);
    return response;
  } catch {
    return {
      success: false,
      error: { code: 'API_UNAVAILABLE', message: 'Local service is not reachable.' },
    };
  }
}

async function viaBridge<T>(
  fn: () => Promise<unknown>,
  fallbackHttp?: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  const b = bridge();
  if (!b) {
    return fallbackHttp
      ? fallbackHttp()
      : { success: false, error: { code: 'NO_BRIDGE', message: 'Desktop bridge unavailable' } };
  }
  try {
    const response = await fn();
    clearExpiredSession(response);
    return response as ApiResponse<T>;
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'IPC_ERROR',
        message: err instanceof Error ? err.message : 'Operation failed',
      },
    };
  }
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// ─── Domain types ─────────────────────────────────────────────

export interface HotelInfo {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gstin?: string | null;
  pan?: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
}

export interface MenuItem {
  id: string;
  name: string;
  sku?: string | null;
  price: string;
  taxRate: string;
  description?: string | null;
  isAvailable: boolean;
  categoryId: string;
  categoryName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MenuListResponse {
  categories: MenuCategory[];
  items: MenuItem[];
}

export interface TableOrderItem {
  id: string;
  menuItemId?: string | null;
  name: string;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  lineTotal: string;
  notes?: string | null;
}

export interface TableOpenBill {
  id: string;
  orderNumber: string;
  openedAt: string;
  createdBy?: string | null;
  itemCount: number;
  lineCount: number;
  subtotal: string;
  tax: string;
  total: string;
  items: TableOrderItem[];
}

export interface DiningTable {
  id: string;
  number: string;
  capacity: number;
  floor: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'INACTIVE';
  isActive: boolean;
  createdAt: string;
  openBill: TableOpenBill | null;
}

export interface TableListResponse {
  items: DiningTable[];
  summary: { total: number; available: number; occupied: number };
}

export interface TableInput {
  number: string;
  capacity?: number;
  floor?: number;
}

export interface BulkTableResult {
  requested: number;
  created: string[];
  skipped: string[];
  createdCount: number;
  skippedCount: number;
}

export interface BillListItem {
  id: string;
  billNumber: string;
  status: string;
  date: string;
  customerName?: string | null;
  customerMobile?: string | null;
  grandTotal: string;
  subtotal: string;
  totalTax: string;
  createdBy?: string | null;
}

export interface BillDetail {
  id: string;
  billNumber: string;
  status: string;
  date: string;
  customerName?: string | null;
  customerMobile?: string | null;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  roundingAmount: string;
  grandTotal: string;
  notes?: string | null;
  terms?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  tableNumber?: string | null;
  createdBy?: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: string;
    unitPrice: string;
    taxRate: string;
    lineTotal: string;
  }>;
}

export interface BillListResponse {
  items: BillListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerSummary {
  key: string;
  name?: string | null;
  mobile?: string | null;
  visits: number;
  totalSpent: string;
  lastBillNumber: string;
  firstVisit: string;
  lastVisit: string;
}

export interface CustomerListResponse {
  items: CustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BillLineInput {
  menuItemId: string;
  quantity: string;
  notes?: string;
}

export interface CreateBillInput {
  clientRequestId?: string;
  customerName?: string;
  customerMobile?: string;
  items: BillLineInput[];
  notes?: string;
  /** Absolute discount on the bill, exclusive with discountPercent. */
  discountAmount?: string;
  /** Percentage discount on the bill, exclusive with discountAmount. */
  discountPercent?: string;
}

export interface DashboardSummary {
  today: { bills: number; revenue: string };
  recentBills: Array<{
    id: string;
    billNumber: string;
    date: string;
    customerName?: string | null;
    total: string;
    status: string;
  }>;
  financials: {
    totalRevenue: string;
    totalBills: number;
    monthRevenue: string;
    monthBills: number;
    avgBillValue: string;
  } | null;
}

export interface AnalyticsSummary {
  range: { from: string; to: string; groupBy: 'day' | 'week' | 'month' };
  totals: { revenue: string; bills: number; avgBillValue: string };
  today: { revenue: string; bills: number };
  month: { revenue: string; bills: number };
  series: Array<{ period: string; revenue: number; bills: number }>;
  monthlyRevenue: Array<{ period: string; revenue: number; bills: number }>;
  bestDay: { period: string; revenue: number; bills: number } | null;
  bestDays: Array<{ period: string; revenue: number; bills: number }>;
  bestSellers: Array<{ name: string; quantity: number; revenue: number }>;
  recentBills: Array<{
    id: string;
    billNumber: string;
    date: string;
    customerName?: string | null;
    total: string;
    status: string;
    createdBy?: string | null;
  }>;
  note: string;
}

export interface ManagerAccount {
  id: string;
  username: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

// ─── API methods ──────────────────────────────────────────────
export const api = {
  auth: {
    /**
     * Hand the persisted session token back to the desktop main process after an
     * app restart. In the browser the API is called directly, so nothing to do.
     */
    async restoreSession(token: string | null): Promise<void> {
      const b = bridge();
      if (!token || !b) return;
      try {
        await b.auth.setToken(token);
      } catch {
        // A failed restore simply means the next call answers UNAUTHENTICATED,
        // which clears the stale session and returns the user to sign-in.
      }
    },
    async login(username: string, password: string) {
      const b = bridge();
      if (b) {
        return (await b.auth.login(username, password)) as ApiResponse<{
          user: SessionUser;
          token: string;
        }>;
      }
      return http<{ user: SessionUser; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },
    async logout(userId?: string) {
      const b = bridge();
      if (b) return b.auth.logout(userId) as Promise<ApiResponse<{ loggedOut: boolean }>>;
      return http('/api/auth/logout', { method: 'POST', body: JSON.stringify({ userId }) });
    },
    async changePassword(currentPassword: string, newPassword: string) {
      const b = bridge();
      if (b) {
        return (await b.auth.changePassword(currentPassword, newPassword)) as ApiResponse<{
          changed: boolean;
        }>;
      }
      return http<{ changed: boolean }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
  },

  setup: {
    /** Whether this installation still needs first-run setup (no owner account yet). */
    status: () =>
      viaBridge<{ required: boolean }>(
        () => bridge()!.setup.status(),
        () => http<{ required: boolean }>('/api/setup/status'),
      ),
    complete: (data: {
      hotelName: string;
      ownerFullName: string;
      username: string;
      password: string;
      hotelAddress?: string;
      hotelCity?: string;
      hotelPhone?: string;
      hotelEmail?: string;
    }) =>
      viaBridge<{ username: string; userId: string }>(
        () => bridge()!.setup.complete(data),
        () =>
          http<{ username: string; userId: string }>('/api/setup', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      ),
  },

  license: {
    /** Subscription state of this computer (machine code, expiry, term). */
    status: () =>
      viaBridge<LicenseStatus>(
        () => bridge()!.license.status(),
        () => http<LicenseStatus>('/api/license/status'),
      ),
    activate: (key: string) =>
      viaBridge<LicenseStatus>(
        () => bridge()!.license.activate(key),
        () =>
          http<LicenseStatus>('/api/license/activate', {
            method: 'POST',
            body: JSON.stringify({ key }),
          }),
      ),
    renew: (key: string) =>
      viaBridge<LicenseStatus>(
        () => bridge()!.license.renew(key),
        () =>
          http<LicenseStatus>('/api/license/renew', {
            method: 'POST',
            body: JSON.stringify({ key }),
          }),
      ),
  },

  dashboard: {
    summary: () =>
      viaBridge<DashboardSummary>(
        () => bridge()!.dashboard.summary(),
        () => http<DashboardSummary>('/api/dashboard/summary'),
      ),
  },

  menu: {
    list: (params?: { search?: string; categoryId?: string; available?: string }) =>
      viaBridge<MenuListResponse>(
        () => bridge()!.menu.list(params),
        () => http<MenuListResponse>(`/api/menu${qs(params)}`),
      ),
    createCategory: (name: string) =>
      viaBridge<MenuCategory>(
        () => bridge()!.menu.createCategory({ name }),
        () =>
          http<MenuCategory>('/api/menu/categories', {
            method: 'POST',
            body: JSON.stringify({ name }),
          }),
      ),
    createItem: (data: unknown) =>
      viaBridge<MenuItem>(
        () => bridge()!.menu.createItem(data),
        () =>
          http<MenuItem>('/api/menu/items', { method: 'POST', body: JSON.stringify(data) }),
      ),
    updateItem: (id: string, data: unknown) =>
      viaBridge<MenuItem>(
        () => bridge()!.menu.updateItem(id, data),
        () =>
          http<MenuItem>(`/api/menu/items/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
          }),
      ),
    deleteItem: (id: string) =>
      viaBridge<{ deleted: boolean }>(
        () => bridge()!.menu.deleteItem(id),
        () => http(`/api/menu/items/${id}`, { method: 'DELETE' }),
      ),
  },

  tables: {
    list: (params?: { search?: string; status?: string }) =>
      viaBridge<TableListResponse>(
        () => bridge()!.tables.list(params),
        () => http<TableListResponse>(`/api/tables${qs(params)}`),
      ),
    get: (id: string) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.get(id),
        () => http<DiningTable>(`/api/tables/${id}`),
      ),
    create: (data: TableInput) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.create(data),
        () => http<DiningTable>('/api/tables', { method: 'POST', body: JSON.stringify(data) }),
      ),
    bulkCreate: (data: { count: number; capacity?: number; floor?: number }) =>
      viaBridge<BulkTableResult>(
        () => bridge()!.tables.bulkCreate(data),
        () =>
          http<BulkTableResult>('/api/tables/bulk', {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      ),
    update: (id: string, data: Partial<TableInput> & { isActive?: boolean }) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.update(id, data),
        () =>
          http<DiningTable>(`/api/tables/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
          }),
      ),
    remove: (id: string) =>
      viaBridge<{ deleted: boolean }>(
        () => bridge()!.tables.remove(id),
        () => http(`/api/tables/${id}`, { method: 'DELETE' }),
      ),
    addItems: (id: string, items: BillLineInput[]) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.addItems(id, { items }),
        () =>
          http<DiningTable>(`/api/tables/${id}/items`, {
            method: 'POST',
            body: JSON.stringify({ items }),
          }),
      ),
    removeItem: (id: string, itemId: string) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.removeItem(id, itemId),
        () => http<DiningTable>(`/api/tables/${id}/items/${itemId}`, { method: 'DELETE' }),
      ),
    setItemQuantity: (id: string, itemId: string, quantity: number) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.setItemQuantity(id, itemId, quantity),
        () =>
          http<DiningTable>(`/api/tables/${id}/items/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity }),
          }),
      ),
    checkout: (
      id: string,
      data: {
        clientRequestId?: string;
        customerName?: string;
        customerMobile?: string;
        notes?: string;
        discountAmount?: string;
        discountPercent?: string;
      },
    ) =>
      viaBridge<BillDetail>(
        () => bridge()!.tables.checkout(id, data),
        () =>
          http<BillDetail>(`/api/tables/${id}/checkout`, {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      ),
    cancel: (id: string) =>
      viaBridge<DiningTable>(
        () => bridge()!.tables.cancel(id),
        () => http<DiningTable>(`/api/tables/${id}/cancel`, { method: 'POST' }),
      ),
  },

  bills: {
    list: (params?: {
      search?: string;
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    }) =>
      viaBridge<BillListResponse>(
        () => bridge()!.bills.list(params),
        () => http<BillListResponse>(`/api/bills${qs(params)}`),
      ),
    get: (id: string) =>
      viaBridge<BillDetail>(
        () => bridge()!.bills.get(id),
        () => http<BillDetail>(`/api/bills/${id}`),
      ),
    create: (data: CreateBillInput) =>
      viaBridge<BillDetail>(
        () => bridge()!.bills.create(data),
        () =>
          http<BillDetail>('/api/bills', { method: 'POST', body: JSON.stringify(data) }),
      ),
    cancel: (id: string, reason: string) =>
      viaBridge<{ cancelled: boolean }>(
        () => bridge()!.bills.cancel(id, reason),
        () =>
          http(`/api/bills/${id}/cancel`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          }),
      ),
  },

  customers: {
    list: (params?: { search?: string; page?: number; pageSize?: number }) =>
      viaBridge<CustomerListResponse>(
        () => bridge()!.customers.list(params),
        () => http<CustomerListResponse>(`/api/customers${qs(params)}`),
      ),
    lookup: (params: { mobile?: string; name?: string }) =>
      viaBridge<CustomerSummary | null>(
        () => bridge()!.customers.lookup(params),
        () => http<CustomerSummary | null>(`/api/customers/lookup${qs(params)}`),
      ),
  },

  analytics: {
    summary: (params?: {
      preset?: string;
      from?: string;
      to?: string;
      groupBy?: string;
    }) =>
      viaBridge<AnalyticsSummary>(
        () => bridge()!.analytics.summary(params),
        () => http<AnalyticsSummary>(`/api/analytics/summary${qs(params)}`),
      ),
  },

  users: {
    list: () =>
      viaBridge<ManagerAccount[]>(
        () => bridge()!.users.list(),
        () => http<ManagerAccount[]>('/api/users'),
      ),
    create: (data: unknown) =>
      viaBridge<{ id: string; username: string }>(
        () => bridge()!.users.create(data),
        () =>
          http('/api/users', { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: (id: string, data: unknown) =>
      viaBridge<{ updated: boolean }>(
        () => bridge()!.users.update(id, data),
        () => http(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    remove: (id: string) =>
      viaBridge<{ archived: boolean }>(
        () => bridge()!.users.remove(id),
        () => http(`/api/users/${id}`, { method: 'DELETE' }),
      ),
  },

  hotel: {
    get: () =>
      viaBridge<HotelInfo>(
        () => bridge()!.hotel.get(),
        () => http<HotelInfo>('/api/hotel'),
      ),
    getSettings: () =>
      viaBridge<Record<string, string>>(
        () => bridge()!.hotel.getSettings(),
        () => http<Record<string, string>>('/api/settings'),
      ),
  },

  settings: {
    updateHotel: (data: unknown) =>
      viaBridge<HotelInfo>(
        () => bridge()!.settings.updateHotel(data),
        () =>
          http<HotelInfo>('/api/settings/hotel', {
            method: 'PUT',
            body: JSON.stringify(data),
          }),
      ),
    update: (data: Record<string, string>) =>
      viaBridge<Record<string, string>>(
        () => bridge()!.settings.update(data),
        () =>
          http<Record<string, string>>('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(data),
          }),
      ),
  },

  print: {
    getPrinters: () =>
      viaBridge<Array<{ name: string; isDefault: boolean }>>(
        () => bridge()!.print.getPrinters(),
        undefined,
      ),
    invoice: (payload: unknown) => viaBridge(() => bridge()!.print.invoice(payload), undefined),
    /** The exact document HTML for the in-app print preview. */
    render: (payload: unknown) =>
      viaBridge<{ html: string }>(() => bridge()!.print.render(payload), undefined),
    test: (printerName?: string) =>
      viaBridge(() => bridge()!.print.test(printerName), undefined),
    saveCopy: (payload: unknown) =>
      viaBridge(() => bridge()!.print.saveCopy(payload), undefined),
  },

  backup: {
    create: () =>
      viaBridge<{ fileName: string; filePath: string; fileSize: number }>(
        () => bridge()!.backup.create(),
        undefined,
      ),
    list: () =>
      viaBridge<Array<{ fileName: string; filePath: string; fileSize: number; createdAt: string }>>(
        () => bridge()!.backup.list(),
        undefined,
      ),
    restore: (filePath: string) =>
      viaBridge<{ safetyBackup: string }>(() => bridge()!.backup.restore(filePath), undefined),
    openFolder: () => viaBridge(() => bridge()!.backup.openFolder(), undefined),
  },
};
