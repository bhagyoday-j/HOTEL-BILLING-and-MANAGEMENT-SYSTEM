import { useQuery } from '@tanstack/react-query';
import type { LicenseStatus } from '@hotel-billing/shared';
import { api } from '@/services/api';

/** Shared cache key for the subscription state of this computer. */
export const licenseQueryKey = ['license-status'] as const;

/** Thrown while the local API has not answered yet, so the query keeps retrying. */
class ApiStartingError extends Error {}

/**
 * Subscription state (active / expired / not activated) for this PC.
 *
 * The desktop window can appear before the local API is ready, so transport
 * failures are retried briefly instead of showing an error. The status is also
 * refreshed once a minute so a subscription that expires while the app is open
 * sends the user to the renewal screen.
 */
export function useLicenseStatus() {
  return useQuery<LicenseStatus>({
    queryKey: [...licenseQueryKey],
    queryFn: async () => {
      const res = await api.license.status();
      if (!res.success) {
        if (res.error.code === 'API_UNAVAILABLE' || res.error.code === 'IPC_ERROR') {
          throw new ApiStartingError(res.error.message);
        }
        throw new Error(res.error.message);
      }
      return res.data;
    },
    retry: (failureCount, error) =>
      error instanceof ApiStartingError ? failureCount < 24 : failureCount < 1,
    retryDelay: 500,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
}
