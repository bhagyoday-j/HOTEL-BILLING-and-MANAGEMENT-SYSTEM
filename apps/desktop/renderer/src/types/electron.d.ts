export type ElectronApi = {
  app: {
    getVersion: () => Promise<string>;
    getPaths: () => Promise<Record<string, string>>;
  };
  auth: {
    login: (username: string, password: string) => Promise<unknown>;
    logout: (userId?: string) => Promise<unknown>;
    changePassword: (currentPassword: string, newPassword: string) => Promise<unknown>;
    setToken: (token: string) => Promise<unknown>;
  };
  setup: {
    status: () => Promise<unknown>;
    complete: (data: unknown) => Promise<unknown>;
  };
  license: {
    status: () => Promise<unknown>;
    activate: (key: string) => Promise<unknown>;
    renew: (key: string) => Promise<unknown>;
  };
  dashboard: {
    summary: () => Promise<unknown>;
  };
  menu: {
    list: (query?: Record<string, unknown>) => Promise<unknown>;
    createCategory: (data: unknown) => Promise<unknown>;
    createItem: (data: unknown) => Promise<unknown>;
    updateItem: (id: string, data: unknown) => Promise<unknown>;
    deleteItem: (id: string) => Promise<unknown>;
  };
  tables: {
    list: (query?: Record<string, unknown>) => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<unknown>;
    bulkCreate: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    addItems: (id: string, data: unknown) => Promise<unknown>;
    removeItem: (id: string, itemId: string) => Promise<unknown>;
    setItemQuantity: (id: string, itemId: string, quantity: number) => Promise<unknown>;
    checkout: (id: string, data: unknown) => Promise<unknown>;
    cancel: (id: string) => Promise<unknown>;
  };
  bills: {
    list: (query?: Record<string, unknown>) => Promise<unknown>;
    get: (id: string) => Promise<unknown>;
    create: (data: unknown) => Promise<unknown>;
    cancel: (id: string, reason: string) => Promise<unknown>;
  };
  customers: {
    list: (query?: Record<string, unknown>) => Promise<unknown>;
    lookup: (query?: Record<string, unknown>) => Promise<unknown>;
  };
  analytics: {
    summary: (query?: Record<string, unknown>) => Promise<unknown>;
  };
  users: {
    list: () => Promise<unknown>;
    create: (data: unknown) => Promise<unknown>;
    update: (id: string, data: unknown) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
  };
  hotel: {
    get: () => Promise<unknown>;
    getSettings: () => Promise<unknown>;
  };
  settings: {
    updateHotel: (data: unknown) => Promise<unknown>;
    update: (data: unknown) => Promise<unknown>;
  };
  system: {
    dbIntegrity: () => Promise<unknown>;
    serverStatus: () => Promise<unknown>;
  };
  print: {
    getPrinters: () => Promise<unknown>;
    invoice: (payload: unknown) => Promise<unknown>;
    test: (printerName?: string) => Promise<unknown>;
    saveCopy: (payload: unknown) => Promise<unknown>;
  };
  backup: {
    create: () => Promise<unknown>;
    list: () => Promise<unknown>;
    restore: (filePath: string) => Promise<unknown>;
    validate: (filePath: string) => Promise<unknown>;
    export: (filePath: string) => Promise<unknown>;
    openFolder: () => Promise<unknown>;
  };
  shell: {
    openExternal: (url: string) => Promise<unknown>;
  };
};

declare global {
  interface Window {
    api?: ElectronApi;
  }
}

export {};
