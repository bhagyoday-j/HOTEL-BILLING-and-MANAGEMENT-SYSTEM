import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { getAppPaths } from '../database/paths';

function createLogger() {
  let logDir: string;
  try {
    logDir = getAppPaths().logs;
    fs.mkdirSync(logDir, { recursive: true });
  } catch {
    logDir = path.join(process.cwd(), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
  }

  const isDev = process.env.NODE_ENV === 'development';

  return pino(
    {
      level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
      redact: {
        paths: ['password', 'passwordHash', 'pin', 'pinHash'],
        remove: true,
      },
    },
    pino.destination({
      dest: path.join(logDir, 'electron.log'),
      sync: false,
      mkdir: true,
    }),
  );
}

export const logger = createLogger();
