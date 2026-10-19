import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { LOCAL_API_HOST, LOCAL_API_PORT } from '@hotel-billing/shared';
import { logger } from '../security/logger';
import { getAppPaths } from '../database/paths';
import { API_BASE } from '../ipc/apiClient';

let serverProcess: ChildProcess | null = null;
let crashed = false;

/** How long to wait for the API to answer before showing the UI anyway. */
const STARTUP_TIMEOUT_MS = 15_000;
const HEALTH_POLL_INTERVAL_MS = 250;

export function isServerRunning(): boolean {
  return serverProcess !== null && serverProcess.exitCode === null && serverProcess.killed === false;
}

export function hasServerCrashed(): boolean {
  return crashed;
}

export function resetCrashFlag(): void {
  crashed = false;
}

/** Resolves true as soon as the local API answers a health check. */
async function isApiHealthy(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Start the local Express API as a child process.
 * - Development: `npm run dev` starts the server separately; this is a no-op.
 * - Production: runs the compiled server from the app bundle with the AppData DB.
 *
 * The returned promise ALWAYS settles: it resolves once the API is healthy, and also
 * when the child exits, fails to spawn, or the startup timeout elapses. A startup
 * problem must never leave the caller waiting forever — that previously kept the main
 * window from ever being created, so clicking the app appeared to do nothing.
 */
export function startServer(): Promise<void> {
  if (app.isPackaged === false && process.env.NODE_ENV === 'development') {
    // In dev, `npm run dev` starts the server separately.
    return Promise.resolve();
  }

  const paths = getAppPaths();
  // The server ships inside the packaged app (resources/app.asar), so resolve the entry
  // from the app root — not resourcesPath, which would look outside the asar.
  const serverEntry = path.join(app.getAppPath(), 'apps', 'server', 'dist', 'index.js');

  if (!fs.existsSync(serverEntry)) {
    logger.error({ serverEntry }, 'Server entry not found');
    return Promise.reject(new Error(`Server entry not found: ${serverEntry}`));
  }

  // Migrations are bundled as an extra resource so the server can create/upgrade
  // the AppData database on a machine that has never run the app before.
  const migrationsDir = path.join(process.resourcesPath, 'prisma', 'migrations');

  crashed = false;

  return new Promise<void>((resolve) => {
    let settled = false;

    const finish = (reason: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      clearInterval(poll);
      logger.info({ reason }, 'Local API startup check finished');
      resolve();
    };

    const child = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: `file:${paths.databaseFile.replace(/\\/g, '/')}`,
        PRISMA_MIGRATIONS_DIR: migrationsDir,
        PORT: String(LOCAL_API_PORT),
        HOST: LOCAL_API_HOST,
        LOG_DIR: paths.logs,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess = child;

    // Both handles are captured by `finish`, which only ever runs after they are
    // assigned (the child exits and the timers fire asynchronously).
    const deadline = setTimeout(() => finish('timeout'), STARTUP_TIMEOUT_MS);
    const poll = setInterval(() => {
      void isApiHealthy().then((healthy) => {
        if (healthy) finish('healthy');
      });
    }, HEALTH_POLL_INTERVAL_MS);
    void isApiHealthy().then((healthy) => {
      if (healthy) finish('healthy');
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      logger.info({ out: chunk.toString().trim() }, 'server stdout');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      logger.error({ err: chunk.toString().trim() }, 'server stderr');
    });
    child.on('error', (err) => {
      logger.error({ err }, 'Local API failed to spawn');
      crashed = true;
      serverProcess = null;
      finish('spawn-error');
    });
    child.on('exit', (code) => {
      logger.warn({ code }, 'Local API server exited');
      crashed = true;
      serverProcess = null;
      finish('exited');
    });

    logger.info({ pid: child.pid, entry: serverEntry }, 'Local API server spawned');
  });
}

export function stopServer(): void {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    serverProcess = null;
  }
}
