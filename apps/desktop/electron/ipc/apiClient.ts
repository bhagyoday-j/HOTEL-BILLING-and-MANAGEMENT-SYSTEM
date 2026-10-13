import { LOCAL_API_HOST, LOCAL_API_PORT } from '@hotel-billing/shared';
import { logger } from '../security/logger';

export const API_BASE =
  process.env.VITE_API_URL ?? `http://${LOCAL_API_HOST}:${LOCAL_API_PORT}`;

export class ApiUnavailableError extends Error {
  constructor() {
    super('Local API is not reachable');
    this.name = 'ApiUnavailableError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit & { raw?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiUnavailableError();
  }

  const body = (await res.json()) as T;
  return body;
}

/**
 * Forward an authenticated request: passes the renderer's Bearer token
 * through to the local API so RBAC applies uniformly.
 */
export async function apiFetchAuth<T>(
  path: string,
  token: string | undefined,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export function withFallback<T>(promise: () => Promise<T>, code: string): Promise<T> {
  return promise().catch((err) => {
    logger.error({ err }, `IPC call failed: ${code}`);
    throw err;
  });
}
