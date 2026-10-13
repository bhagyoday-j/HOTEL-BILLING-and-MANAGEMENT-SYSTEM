import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between renderer and main. No Node APIs, no fs, no child
 * processes leak through. Every method maps to an explicit IPC channel.
 */
const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
  },
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', { username, password }),
    pinLogin: (username: string, pin: string) =>
      ipcRenderer.invoke('auth:pin-login', { username, pin }),
    logout: (userId?: string) => ipcRenderer.invoke('auth:logout', { userId }),
  },
  guests: {
    list: () => ipcRenderer.invoke('guests:list'),
    search: (q: string) => ipcRenderer.invoke('guests:search', q),
    get: (id: string) => ipcRenderer.invoke('guests:get', id),
    create: (data: unknown) => ipcRenderer.invoke('guests:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('guests:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('guests:remove', id),
  },
  rooms: {
    list: () => ipcRenderer.invoke('rooms:list'),
    grid: () => ipcRenderer.invoke('rooms:grid'),
    types: () => ipcRenderer.invoke('rooms:types'),
    get: (id: string) => ipcRenderer.invoke('rooms:get', id),
    create: (data: unknown) => ipcRenderer.invoke('rooms:create', data),
    createType: (data: unknown) => ipcRenderer.invoke('rooms:createType', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('rooms:update', id, data),
    updateStatus: (id: string, status: string) =>
      ipcRenderer.invoke('rooms:updateStatus', id, status),
    remove: (id: string) => ipcRenderer.invoke('rooms:remove', id),
  },
  bookings: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('bookings:list', query),
    get: (id: string) => ipcRenderer.invoke('bookings:get', id),
    folio: (id: string) => ipcRenderer.invoke('bookings:folio', id),
    create: (data: unknown) => ipcRenderer.invoke('bookings:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('bookings:update', id, data),
    cancel: (id: string, reason: string) => ipcRenderer.invoke('bookings:cancel', id, reason),
    checkIn: (id: string) => ipcRenderer.invoke('bookings:checkIn', id),
    checkOut: (id: string, data: unknown) => ipcRenderer.invoke('bookings:checkOut', id, data),
  },
  restaurant: {
    menu: () => ipcRenderer.invoke('restaurant:menu'),
    tables: () => ipcRenderer.invoke('restaurant:tables'),
    createCategory: (data: unknown) => ipcRenderer.invoke('restaurant:createCategory', data),
    createMenuItem: (data: unknown) => ipcRenderer.invoke('restaurant:createMenuItem', data),
    updateMenuItem: (id: string, data: unknown) =>
      ipcRenderer.invoke('restaurant:updateMenuItem', id, data),
    createTable: (data: unknown) => ipcRenderer.invoke('restaurant:createTable', data),
    orders: (query?: Record<string, unknown>) => ipcRenderer.invoke('restaurant:orders', query),
    getOrder: (id: string) => ipcRenderer.invoke('restaurant:getOrder', id),
    createOrder: (data: unknown) => ipcRenderer.invoke('restaurant:createOrder', data),
    addItems: (id: string, items: unknown[]) => ipcRenderer.invoke('restaurant:addItems', id, items),
    cancelOrder: (id: string, reason: string) =>
      ipcRenderer.invoke('restaurant:cancelOrder', id, reason),
    payOrder: (id: string, data: unknown) => ipcRenderer.invoke('restaurant:payOrder', id, data),
  },
  invoices: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('invoices:list', query),
    get: (id: string) => ipcRenderer.invoke('invoices:get', id),
    create: (data: unknown) => ipcRenderer.invoke('invoices:create', data),
    addPayment: (id: string, data: unknown) => ipcRenderer.invoke('invoices:addPayment', id, data),
    cancel: (id: string, reason: string) => ipcRenderer.invoke('invoices:cancel', id, reason),
  },
  expenses: {
    categories: () => ipcRenderer.invoke('expenses:categories'),
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('expenses:list', query),
    create: (data: unknown) => ipcRenderer.invoke('expenses:create', data),
  },
  cash: {
    current: () => ipcRenderer.invoke('cash:current'),
    open: (data: unknown) => ipcRenderer.invoke('cash:open', data),
    summary: (id: string) => ipcRenderer.invoke('cash:summary', id),
    close: (id: string, data: unknown) => ipcRenderer.invoke('cash:close', id, data),
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('cash:list', query),
  },
  reports: {
    salesSummary: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:salesSummary', query),
    revenueByDay: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:revenueByDay', query),
    paymentsByMethod: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:paymentsByMethod', query),
    topMenuItems: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:topMenuItems', query),
    occupancy: (query?: Record<string, unknown>) => ipcRenderer.invoke('reports:occupancy', query),
    outstandingDues: () => ipcRenderer.invoke('reports:outstandingDues'),
    gstSummary: (query?: Record<string, unknown>) => ipcRenderer.invoke('reports:gstSummary', query),
    guestReport: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:guestReport', query),
    expenseReport: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:expenseReport', query),
    cancelledInvoices: (query?: Record<string, unknown>) =>
      ipcRenderer.invoke('reports:cancelledInvoices', query),
  },
  search: (q: string) => ipcRenderer.invoke('search', q),
  dashboard: {
    summary: () => ipcRenderer.invoke('dashboard:summary'),
  },
  hotel: {
    get: () => ipcRenderer.invoke('hotel:get'),
    getSettings: () => ipcRenderer.invoke('hotel:getSettings'),
  },
  settings: {
    updateHotel: (data: unknown) => ipcRenderer.invoke('settings:updateHotel', data),
    update: (data: unknown) => ipcRenderer.invoke('settings:update', data),
    refreshScheduler: () => ipcRenderer.invoke('settings:refreshScheduler'),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    roles: () => ipcRenderer.invoke('users:roles'),
    create: (data: unknown) => ipcRenderer.invoke('users:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('users:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('users:remove', id),
  },
  audit: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('audit:list', query),
  },
  system: {
    backups: () => ipcRenderer.invoke('system:backups'),
    dbIntegrity: () => ipcRenderer.invoke('system:dbIntegrity'),
    serverStatus: () => ipcRenderer.invoke('server:status'),
  },
  print: {
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
    invoice: (payload: unknown) => ipcRenderer.invoke('print:invoice', payload),
    kot: (payload: unknown) => ipcRenderer.invoke('print:kot', payload),
    test: (printerName?: string) => ipcRenderer.invoke('print:test', { printerName }),
    saveCopy: (payload: unknown) => ipcRenderer.invoke('print:savePdf', payload),
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    restore: (filePath: string) => ipcRenderer.invoke('backup:restore', { filePath }),
    validate: (filePath: string) => ipcRenderer.invoke('backup:validate', { filePath }),
    export: (filePath: string) => ipcRenderer.invoke('backup:export', { filePath }),
    openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type ElectronApi = typeof api;
