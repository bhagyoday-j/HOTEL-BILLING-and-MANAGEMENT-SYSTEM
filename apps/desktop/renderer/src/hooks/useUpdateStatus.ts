import { useEffect, useState } from 'react';
import type { UpdateStatus } from '@hotel-billing/shared';
import { api } from '@/services/api';

/**
 * Live update state from the Electron main process.
 *
 * In the browser there is no bridge, so the hook returns null and the UI shows
 * the desktop-only explanation. The initial IPC read covers an update that was
 * downloaded before this window opened; `onStatus` covers later changes.
 */
export function useUpdateStatus(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.api : undefined;
    if (!bridge) return;

    let active = true;
    void api.updates
      .status()
      .then((res) => {
        if (active && res.success) setStatus(res.data);
      })
      .catch(() => undefined);

    const unsubscribe = bridge.updates.onStatus((next) => {
      if (active) setStatus(next);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}
