export type ElectronApi = {
  app: {
    getVersion: () => Promise<string>;
    getPaths: () => Promise<Record<string, string>>;
  };
  auth: {
    login: (username: string, password: string) => Promise<unknown>;
    logout: (userId?: string) => Promise<unknown>;
  };
  rooms: {
    list: () => Promise<unknown>;
    grid: () => Promise<unknown>;
  };
  hotel: {
    get: () => Promise<unknown>;
    getSettings: () => Promise<unknown>;
  };
  dashboard: {
    summary: () => Promise<unknown>;
  };
  print: {
    getPrinters: () => Promise<unknown>;
    testPrint: () => Promise<unknown>;
  };
  backup: {
    create: () => Promise<unknown>;
  };
};

declare global {
  interface Window {
    api?: ElectronApi;
  }
}

export {};
