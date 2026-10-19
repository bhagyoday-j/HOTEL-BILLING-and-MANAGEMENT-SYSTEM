import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between renderer and main. No Node APIs, no fs, no child
 * processes leak through. Every method maps to an explicit IPC channel.
 *
 * Surface is limited to the simplified app: auth, dashboard, menu, bills,
 * analytics, manager accounts, hotel/settings, printing, backups.
 */
const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPaths: () => ipcRenderer.invoke('app:getPaths'),
  },
  auth: {
    login: (username: string, password: string) =>
      ipcRenderer.invoke('auth:login', { username, password }),
    logout: (userId?: string) => ipcRenderer.invoke('auth:logout', { userId }),
    changePassword: (currentPassword: string, newPassword: string) =>
      ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword }),
  },
  setup: {
    status: () => ipcRenderer.invoke('setup:status'),
    complete: (data: unknown) => ipcRenderer.invoke('setup:complete', data),
  },
  dashboard: {
    summary: () => ipcRenderer.invoke('dashboard:summary'),
  },
  menu: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('menu:list', query),
    createCategory: (data: unknown) => ipcRenderer.invoke('menu:createCategory', data),
    createItem: (data: unknown) => ipcRenderer.invoke('menu:createItem', data),
    updateItem: (id: string, data: unknown) => ipcRenderer.invoke('menu:updateItem', id, data),
    deleteItem: (id: string) => ipcRenderer.invoke('menu:deleteItem', id),
  },
  bills: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('bills:list', query),
    get: (id: string) => ipcRenderer.invoke('bills:get', id),
    create: (data: unknown) => ipcRenderer.invoke('bills:create', data),
    cancel: (id: string, reason: string) => ipcRenderer.invoke('bills:cancel', id, { reason }),
  },
  customers: {
    list: (query?: Record<string, unknown>) => ipcRenderer.invoke('customers:list', query),
    lookup: (query?: Record<string, unknown>) => ipcRenderer.invoke('customers:lookup', query),
  },
  analytics: {
    summary: (query?: Record<string, unknown>) => ipcRenderer.invoke('analytics:summary', query),
  },
  users: {
    list: () => ipcRenderer.invoke('users:list'),
    create: (data: unknown) => ipcRenderer.invoke('users:create', data),
    update: (id: string, data: unknown) => ipcRenderer.invoke('users:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('users:remove', id),
  },
  hotel: {
    get: () => ipcRenderer.invoke('hotel:get'),
    getSettings: () => ipcRenderer.invoke('hotel:getSettings'),
  },
  settings: {
    updateHotel: (data: unknown) => ipcRenderer.invoke('settings:updateHotel', data),
    update: (data: unknown) => ipcRenderer.invoke('settings:update', data),
  },
  system: {
    dbIntegrity: () => ipcRenderer.invoke('system:dbIntegrity'),
    serverStatus: () => ipcRenderer.invoke('server:status'),
  },
  print: {
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
    invoice: (payload: unknown) => ipcRenderer.invoke('print:invoice', payload),
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
