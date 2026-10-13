import type { ApiResponse, SessionUser } from '@hotel-billing/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3847';

function bridge() {
  if (typeof window === 'undefined' || !window.api) return null;
  return window.api;
}

function authHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem('hotel-billing-auth');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    const token = parsed.state?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
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
    return (await res.json()) as ApiResponse<T>;
  } catch {
    return {
      success: false,
      error: { code: 'API_UNAVAILABLE', message: 'Local service is not reachable.' },
    };
  }
}

async function viaBridge<T>(fn: () => Promise<unknown>, fallbackHttp?: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  const b = bridge();
  if (!b) {
    return fallbackHttp ? fallbackHttp() : { success: false, error: { code: 'NO_BRIDGE', message: 'Desktop bridge unavailable' } };
  }
  try {
    return (await fn()) as ApiResponse<T>;
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

// ─── Shared types ─────────────────────────────────────────────
export interface DashboardSummary {
  todayRevenue: string;
  todayBills: number;
  todayCheckIns: number;
  todayCheckOuts: number;
  occupiedRooms: number;
  availableRooms: number;
  reservedRooms: number;
  restaurantSales: string;
  cashCollection: string;
  upiCollection: string;
  cardCollection: string;
  creditAmount: string;
}

export interface RoomGridItem {
  id: string;
  number: string;
  floor: number;
  status: string;
  typeName: string;
  price: string;
  capacity: number;
  description?: string | null;
}

export interface HotelInfo {
  id: string;
  name: string;
  address?: string | null;
  city: string | null;
  state: string | null;
  phone?: string | null;
  email?: string | null;
  gstin: string | null;
}

export interface Guest {
  id: string;
  fullName: string;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  nationality?: string | null;
  notes?: string | null;
}

export interface RoomType {
  id: string;
  name: string;
  description?: string | null;
  basePrice: string;
  maxGuests: number;
  amenities?: string | null;
}

export interface Room {
  id: string;
  number: string;
  floor: number;
  roomTypeId: string;
  roomType?: RoomType;
  price?: string | null;
  capacity?: number | null;
  status: string;
  description?: string | null;
  currentBooking?: {
    id: string;
    bookingNumber: string;
    guest: { fullName: string; mobile?: string | null };
  } | null;
}

export interface Booking {
  id: string;
  bookingNumber: string;
  status: string;
  checkInDate: string;
  checkOutDate: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
  adults: number;
  children: number;
  roomRate: string;
  discountAmount: string;
  advancePayment: string;
  specialRequests?: string | null;
  guest: Guest;
  room: Room;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  notes?: string | null;
}

export interface RestaurantOrder {
  id: string;
  orderNumber: string;
  kotNumber?: string | null;
  orderType: string;
  status: string;
  table?: { id: string; name: string } | null;
  room?: { id: string; number: string } | null;
  booking?: { id: string; bookingNumber: string; guest: Guest } | null;
  guestName?: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  grandTotal: string;
  createdAt: string;
  items: OrderItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  sku?: string | null;
  price: string;
  taxRate: string;
  description?: string | null;
  kitchenName?: string | null;
  isAvailable: boolean;
  categoryId: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  items: MenuItem[];
}

export interface RestaurantTable {
  id: string;
  name: string;
  capacity: number;
  status: string;
  orders: Array<{ id: string; orderNumber: string; grandTotal: string }>;
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  status: string;
  invoiceDate: string;
  guestName?: string | null;
  guestMobile?: string | null;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  room?: { number: string } | null;
  createdBy?: { fullName: string } | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  roundingAmount: string;
  notes?: string | null;
  terms?: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxRate: string;
    lineTotal: string;
    sourceType?: string | null;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    method: string;
    amount: string;
    reference?: string | null;
    createdAt: string;
  }>;
  guest?: Guest | null;
  booking?: { id: string; bookingNumber: string } | null;
}

export interface FolioData {
  booking: Booking;
  nights: number;
  openOrders: Array<{ id: string; orderNumber: string; grandTotal: string }>;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    cgstRate: string;
    sgstRate: string;
    igstRate: string;
    sourceOrderId: string | null;
  }>;
  breakdown: {
    grossAmount: string;
    itemDiscount: string;
    subtotal: string;
    taxableAmount: string;
    cgst: string;
    sgst: string;
    igst: string;
    totalTax: string;
    rounding: string;
    grandTotal: string;
  };
  advance: number;
  dueBeforePayments: string;
  settings: { useIgst: boolean; cgstRate: string; sgstRate: string; igstRate: string };
}

export interface PagedList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CashSession {
  id: string;
  userId: string;
  openedAt: string;
  closedAt?: string | null;
  openingCash: string;
  expectedCash?: string | null;
  actualCash?: string | null;
  difference?: string | null;
  status: string;
  notes?: string | null;
  user?: { fullName: string; username: string };
}

// ─── API methods ──────────────────────────────────────────────
export const api = {
  auth: {
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
      if (b) return b.auth.logout(userId);
      return http('/api/auth/logout', { method: 'POST', body: JSON.stringify({ userId }) });
    },
  },

  dashboard: {
    summary: () =>
      viaBridge<DashboardSummary>(
        () => bridge()!.dashboard.summary(),
        () => http<DashboardSummary>('/api/dashboard/summary'),
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

  guests: {
    list: (params?: { search?: string; page?: number; pageSize?: number }) =>
      viaBridge<PagedList<Guest>>(
        () => bridge()!.guests.list(),
        () => http<PagedList<Guest>>(`/api/guests?${new URLSearchParams(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)])).toString()}`),
      ),
    search: (q: string) =>
      viaBridge<Guest[]>(
        () => bridge()!.guests.search(q),
        () => http<Guest[]>(`/api/guests/search?q=${encodeURIComponent(q)}`),
      ),
    get: (id: string) =>
      viaBridge<Guest & { bookings: Booking[] }>(
        () => bridge()!.guests.get(id),
        () => http<Guest & { bookings: Booking[] }>(`/api/guests/${id}`),
      ),
    create: (data: Partial<Guest>) =>
      viaBridge<Guest>(
        () => bridge()!.guests.create(data),
        () => http<Guest>('/api/guests', { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: (id: string, data: Partial<Guest>) =>
      viaBridge<Guest>(
        () => bridge()!.guests.update(id, data),
        () => http<Guest>(`/api/guests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    remove: (id: string) =>
      viaBridge(
        () => bridge()!.guests.remove(id),
        () => http(`/api/guests/${id}`, { method: 'DELETE' }),
      ),
  },

  rooms: {
    grid: () =>
      viaBridge<RoomGridItem[]>(
        () => bridge()!.rooms.grid(),
        () => http<RoomGridItem[]>('/api/rooms/grid'),
      ),
    list: () =>
      viaBridge<Room[]>(
        () => bridge()!.rooms.list(),
        () => http<Room[]>('/api/rooms'),
      ),
    types: () =>
      viaBridge<RoomType[]>(
        () => bridge()!.rooms.types(),
        () => http<RoomType[]>('/api/rooms/types'),
      ),
    get: (id: string) =>
      viaBridge<Room>(
        () => bridge()!.rooms.get(id),
        () => http<Room>(`/api/rooms/${id}`),
      ),
    create: (data: unknown) =>
      viaBridge<Room>(
        () => bridge()!.rooms.create(data),
        () => http<Room>('/api/rooms', { method: 'POST', body: JSON.stringify(data) }),
      ),
    createType: (data: unknown) =>
      viaBridge<RoomType>(
        () => bridge()!.rooms.createType(data),
        () => http<RoomType>('/api/rooms/types', { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: (id: string, data: unknown) =>
      viaBridge<Room>(
        () => bridge()!.rooms.update(id, data),
        () => http<Room>(`/api/rooms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    updateStatus: (id: string, status: string) =>
      viaBridge<Room>(
        () => bridge()!.rooms.updateStatus(id, status),
        () => http<Room>(`/api/rooms/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
      ),
    remove: (id: string) =>
      viaBridge(
        () => bridge()!.rooms.remove(id),
        () => http(`/api/rooms/${id}`, { method: 'DELETE' }),
      ),
  },

  bookings: {
    list: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<Booking>>(
        () => bridge()!.bookings.list(params),
        () => http<PagedList<Booking>>(`/api/bookings?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    get: (id: string) =>
      viaBridge<Booking & { orders: RestaurantOrder[] }>(
        () => bridge()!.bookings.get(id),
        () => http<Booking & { orders: RestaurantOrder[] }>(`/api/bookings/${id}`),
      ),
    folio: (id: string) =>
      viaBridge<FolioData>(
        () => bridge()!.bookings.folio(id),
        () => http<FolioData>(`/api/bookings/${id}/folio`),
      ),
    create: (data: unknown) =>
      viaBridge<Booking>(
        () => bridge()!.bookings.create(data),
        () => http<Booking>('/api/bookings', { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: (id: string, data: unknown) =>
      viaBridge<Booking>(
        () => bridge()!.bookings.update(id, data),
        () => http<Booking>(`/api/bookings/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    cancel: (id: string, reason: string) =>
      viaBridge(
        () => bridge()!.bookings.cancel(id, reason),
        () => http(`/api/bookings/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
      ),
    checkIn: (id: string) =>
      viaBridge<Booking>(
        () => bridge()!.bookings.checkIn(id),
        () => http<Booking>(`/api/bookings/${id}/check-in`, { method: 'POST' }),
      ),
    checkOut: (id: string, data: unknown) =>
      viaBridge<InvoiceDetail>(
        () => bridge()!.bookings.checkOut(id, data),
        () => http<InvoiceDetail>(`/api/bookings/${id}/check-out`, { method: 'POST', body: JSON.stringify(data) }),
      ),
  },

  restaurant: {
    menu: () =>
      viaBridge<MenuCategory[]>(
        () => bridge()!.restaurant.menu(),
        () => http<MenuCategory[]>('/api/restaurant/menu'),
      ),
    tables: () =>
      viaBridge<RestaurantTable[]>(
        () => bridge()!.restaurant.tables(),
        () => http<RestaurantTable[]>('/api/restaurant/tables'),
      ),
    createCategory: (name: string) =>
      viaBridge(
        () => bridge()!.restaurant.createCategory({ name }),
        () => http('/api/restaurant/menu/categories', { method: 'POST', body: JSON.stringify({ name }) }),
      ),
    createMenuItem: (data: unknown) =>
      viaBridge<MenuItem>(
        () => bridge()!.restaurant.createMenuItem(data),
        () => http<MenuItem>('/api/restaurant/menu/items', { method: 'POST', body: JSON.stringify(data) }),
      ),
    updateMenuItem: (id: string, data: unknown) =>
      viaBridge<MenuItem>(
        () => bridge()!.restaurant.updateMenuItem(id, data),
        () => http<MenuItem>(`/api/restaurant/menu/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    createTable: (name: string, capacity: number) =>
      viaBridge(
        () => bridge()!.restaurant.createTable({ name, capacity }),
        () => http('/api/restaurant/tables', { method: 'POST', body: JSON.stringify({ name, capacity }) }),
      ),
    orders: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<RestaurantOrder>>(
        () => bridge()!.restaurant.orders(params),
        () => http<PagedList<RestaurantOrder>>(`/api/restaurant/orders?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    getOrder: (id: string) =>
      viaBridge<RestaurantOrder>(
        () => bridge()!.restaurant.getOrder(id),
        () => http<RestaurantOrder>(`/api/restaurant/orders/${id}`),
      ),
    createOrder: (data: unknown) =>
      viaBridge<RestaurantOrder>(
        () => bridge()!.restaurant.createOrder(data),
        () => http<RestaurantOrder>('/api/restaurant/orders', { method: 'POST', body: JSON.stringify(data) }),
      ),
    addItems: (id: string, items: unknown[]) =>
      viaBridge<RestaurantOrder>(
        () => bridge()!.restaurant.addItems(id, items),
        () => http<RestaurantOrder>(`/api/restaurant/orders/${id}/items`, { method: 'POST', body: JSON.stringify({ items }) }),
      ),
    cancelOrder: (id: string, reason: string) =>
      viaBridge(
        () => bridge()!.restaurant.cancelOrder(id, reason),
        () => http(`/api/restaurant/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
      ),
    payOrder: (id: string, data: unknown) =>
      viaBridge<InvoiceDetail>(
        () => bridge()!.restaurant.payOrder(id, data),
        () => http<InvoiceDetail>(`/api/restaurant/orders/${id}/pay`, { method: 'POST', body: JSON.stringify(data) }),
      ),
  },

  invoices: {
    list: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<InvoiceListItem>>(
        () => bridge()!.invoices.list(params),
        () => http<PagedList<InvoiceListItem>>(`/api/invoices?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    get: (id: string) =>
      viaBridge<InvoiceDetail>(
        () => bridge()!.invoices.get(id),
        () => http<InvoiceDetail>(`/api/invoices/${id}`),
      ),
    create: (data: unknown) =>
      viaBridge<InvoiceDetail>(
        () => bridge()!.invoices.create(data),
        () => http<InvoiceDetail>('/api/invoices', { method: 'POST', body: JSON.stringify(data) }),
      ),
    addPayment: (id: string, data: { method: string; amount: string; reference?: string }) =>
      viaBridge(
        () => bridge()!.invoices.addPayment(id, data),
        () => http(`/api/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(data) }),
      ),
    cancel: (id: string, reason: string) =>
      viaBridge(
        () => bridge()!.invoices.cancel(id, reason),
        () => http(`/api/invoices/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
      ),
  },

  expenses: {
    categories: () =>
      viaBridge<Array<{ id: string; name: string }>>(
        () => bridge()!.expenses.categories(),
        () => http<Array<{ id: string; name: string }>>('/api/expenses/categories'),
      ),
    list: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<Expense & { category: { name: string }; user: { fullName: string } }>>(
        () => bridge()!.expenses.list(params),
        () => http(`/api/expenses?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    create: (data: unknown) =>
      viaBridge(
        () => bridge()!.expenses.create(data),
        () => http('/api/expenses', { method: 'POST', body: JSON.stringify(data) }),
      ),
  },

  cash: {
    current: () =>
      viaBridge<CashSession | null>(
        () => bridge()!.cash.current(),
        () => http<CashSession | null>('/api/cash-sessions/current'),
      ),
    open: (data: { openingCash: string; notes?: string }) =>
      viaBridge<CashSession>(
        () => bridge()!.cash.open(data),
        () => http<CashSession>('/api/cash-sessions', { method: 'POST', body: JSON.stringify(data) }),
      ),
    summary: (id: string) =>
      viaBridge<{
        session: CashSession;
        cashSales: string;
        cashExpenses: string;
        expectedCash: string;
      }>(
        () => bridge()!.cash.summary(id),
        () => http(`/api/cash-sessions/${id}/summary`),
      ),
    close: (id: string, data: { actualCash: string; notes?: string }) =>
      viaBridge<CashSession>(
        () => bridge()!.cash.close(id, data),
        () => http<CashSession>(`/api/cash-sessions/${id}/close`, { method: 'POST', body: JSON.stringify(data) }),
      ),
    list: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<CashSession>>(
        () => bridge()!.cash.list(params),
        () => http(`/api/cash-sessions?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
  },

  reports: {
    salesSummary: (params?: Record<string, unknown>) =>
      viaBridge<Record<string, string>>(
        () => bridge()!.reports.salesSummary(params),
        () => http(`/api/reports/sales-summary?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    revenueByDay: (params?: Record<string, unknown>) =>
      viaBridge<Array<{ date: string; total: string }>>(
        () => bridge()!.reports.revenueByDay(params),
        () => http(`/api/reports/revenue-by-day?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    paymentsByMethod: (params?: Record<string, unknown>) =>
      viaBridge<Array<{ method: string; total: string }>>(
        () => bridge()!.reports.paymentsByMethod(params),
        () => http(`/api/reports/payments-by-method?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    topMenuItems: (params?: Record<string, unknown>) =>
      viaBridge<Array<{ name: string; quantity: number; total: string }>>(
        () => bridge()!.reports.topMenuItems(params),
        () => http(`/api/reports/top-menu-items?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    occupancy: (params?: Record<string, unknown>) =>
      viaBridge<{ totalRooms: number; bookedNights: number; totalRoomNights: number; occupancyRate: string }>(
        () => bridge()!.reports.occupancy(params),
        () => http(`/api/reports/occupancy?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    outstandingDues: () =>
      viaBridge<
        Array<{
          invoiceNumber: string;
          invoiceDate: string;
          guestName: string;
          room: string | null;
          grandTotal: string;
          paidAmount: string;
          dueAmount: string;
          status: string;
        }>
      >(
        () => bridge()!.reports.outstandingDues(),
        () => http('/api/reports/outstanding-dues'),
      ),
    gstSummary: (params?: Record<string, unknown>) =>
      viaBridge<{
        invoiceCount: number;
        taxableAmount: string;
        cgst: string;
        sgst: string;
        igst: string;
        totalTax: string;
      }>(
        () => bridge()!.reports.gstSummary(params),
        () => http(`/api/reports/gst-summary?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    guestReport: (params?: Record<string, unknown>) =>
      viaBridge<Array<Record<string, unknown>>>(
        () => bridge()!.reports.guestReport(params),
        () => http(`/api/reports/guest-report?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    expenseReport: (params?: Record<string, unknown>) =>
      viaBridge<{
        items: Array<{
          id: string;
          date: string;
          category: string;
          description?: string | null;
          amount: string;
          method: string;
          user: string;
        }>;
        byCategory: Array<{ name: string; total: string }>;
        total: string;
      }>(
        () => bridge()!.reports.expenseReport(params),
        () => http(`/api/reports/expense-report?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
    cancelledInvoices: (params?: Record<string, unknown>) =>
      viaBridge<Array<Record<string, unknown>>>(
        () => bridge()!.reports.cancelledInvoices(params),
        () => http(`/api/reports/cancelled-invoices?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
  },

  search: (q: string) =>
    viaBridge<{
      guests: Array<{ id: string; fullName: string; mobile?: string | null }>;
      invoices: Array<{ id: string; invoiceNumber: string; guestName?: string | null; grandTotal: string; status: string }>;
      bookings: Array<{ id: string; bookingNumber: string; status: string; guest: { fullName: string }; room: { number: string } }>;
      rooms: Array<{ id: string; number: string; status: string }>;
      orders: Array<{ id: string; orderNumber: string; status: string; grandTotal: string }>;
      payments: Array<{ id: string; paymentNumber: string; method: string; amount: string }>;
    }>(
      () => bridge()!.search(q),
      () => http(`/api/search?q=${encodeURIComponent(q)}`),
    ),

  settings: {
    updateHotel: (data: unknown) =>
      viaBridge(
        () => bridge()!.settings.updateHotel(data),
        () => http('/api/settings/hotel', { method: 'PUT', body: JSON.stringify(data) }),
      ),
    update: (data: Record<string, string>) =>
      viaBridge(
        () => bridge()!.settings.update(data),
        () => http('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
      ),
  },

  users: {
    list: () =>
      viaBridge<
        Array<{
          id: string;
          username: string;
          fullName: string;
          email?: string | null;
          roleCode: string;
          isActive: boolean;
          lastLoginAt?: string | null;
          hasPin: boolean;
        }>
      >(
        () => bridge()!.users.list(),
        () => http('/api/users'),
      ),
    roles: () =>
      viaBridge<Array<{ code: string; name: string; permissions: string[] }>>(
        () => bridge()!.users.roles(),
        () => http('/api/users/roles'),
      ),
    create: (data: unknown) =>
      viaBridge(
        () => bridge()!.users.create(data),
        () => http('/api/users', { method: 'POST', body: JSON.stringify(data) }),
      ),
    update: (id: string, data: unknown) =>
      viaBridge(
        () => bridge()!.users.update(id, data),
        () => http(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
      ),
    remove: (id: string) =>
      viaBridge(
        () => bridge()!.users.remove(id),
        () => http(`/api/users/${id}`, { method: 'DELETE' }),
      ),
  },

  audit: {
    list: (params?: Record<string, unknown>) =>
      viaBridge<PagedList<{
        id: string;
        action: string;
        entityType?: string | null;
        entityRef?: string | null;
        details?: string | null;
        createdAt: string;
        user?: { username: string; fullName: string } | null;
      }>>(
        () => bridge()!.audit.list(params),
        () => http(`/api/audit-logs?${new URLSearchParams(
          Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]),
        ).toString()}`),
      ),
  },

  system: {
    dbIntegrity: () =>
      viaBridge<{ ok: boolean; detail: string; databaseUrl: string }>(
        () => bridge()!.system.dbIntegrity(),
        () => http('/api/system/db/integrity'),
      ),
    serverStatus: () =>
      viaBridge<{ running: boolean; apiBase: string; crashed: boolean }>(
        () => bridge()!.system.serverStatus(),
        undefined,
      ),
  },

  print: {
    getPrinters: () =>
      viaBridge<Array<{ name: string; isDefault: boolean; status: string | number }>>(
        () => bridge()!.print.getPrinters(),
        undefined,
      ),
    invoice: (payload: unknown) => viaBridge(() => bridge()!.print.invoice(payload), undefined),
    kot: (payload: unknown) => viaBridge(() => bridge()!.print.kot(payload), undefined),
    test: (printerName?: string) => viaBridge(() => bridge()!.print.test(printerName), undefined),
    saveCopy: (payload: unknown) => viaBridge(() => bridge()!.print.saveCopy(payload), undefined),
  },

  backup: {
    create: () => viaBridge<{ fileName: string; filePath: string; fileSize: number }>(() => bridge()!.backup.create(), undefined),
    list: () =>
      viaBridge<Array<{ fileName: string; filePath: string; fileSize: number; createdAt: string }>>(
        () => bridge()!.backup.list(),
        undefined,
      ),
    restore: (filePath: string) => viaBridge<{ safetyBackup: string }>(() => bridge()!.backup.restore(filePath), undefined),
    export: (filePath: string) => viaBridge<{ savedTo: string }>(() => bridge()!.backup.export(filePath), undefined),
    openFolder: () => viaBridge(() => bridge()!.backup.openFolder(), undefined),
  },
};

export interface Expense {
  id: string;
  categoryId: string;
  amount: string;
  description?: string | null;
  paymentMethod: string;
  expenseDate: string;
  category?: { name: string };
  user?: { fullName: string };
}
