import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { LOCAL_API_HOST, LOCAL_API_PORT } from '@hotel-billing/shared';
import { logger } from '../security/logger';
import { getAppPaths } from '../database/paths';

let serverProcess: ChildProcess | null = null;
let crashed = false;

export function isServerRunning(): boolean {
  return serverProcess !== null && serverProcess.exitCode === null && serverProcess.killed === false;
}

export function hasServerCrashed(): boolean {
  return crashed;
}

export function resetCrashFlag(): void {
  crashed = false;
}

/**
 * Start the local Express API as a child process.
 * - Development: tsx watch (handled by npm scripts); this is a no-op.
 * - Production: runs the compiled server from resources with the AppData DB.
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

  return new Promise((resolve) => {
    serverProcess = spawn(process.execPath, [serverEntry], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: `file:${paths.databaseFile.replace(/\\/g, '/')}`,
        PORT: String(LOCAL_API_PORT),
        HOST: LOCAL_API_HOST,
        LOG_DIR: paths.logs,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => resolve(), 8000);

    serverProcess.stdout?.on('data', (chunk: Buffer) => {
      logger.info({ out: chunk.toString().trim() }, 'server stdout');
    });
    serverProcess.stderr?.on('data', (chunk: Buffer) => {
      logger.error({ err: chunk.toString().trim() }, 'server stderr');
    });
    serverProcess.on('exit', (code) => {
      clearTimeout(timer);
      logger.warn({ code }, 'Local API server exited');
      crashed = true;
      serverProcess = null;
    });

    logger.info({ pid: serverProcess.pid, entry: serverEntry }, 'Local API server spawned');
  });
}

export function stopServer(): void {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    serverProcess = null;
  }
}
