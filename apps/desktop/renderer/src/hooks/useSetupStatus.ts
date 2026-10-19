import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

/** Thrown while the local API has not answered yet, so the query can keep retrying. */
class ApiStartingError extends Error {}

/**
 * Whether this installation still needs first-run setup.
 *
 * The window is shown as soon as it can render, while the local API may still be
 * starting (on a fresh install it also creates the database), so transport failures are
 * retried for a few seconds instead of reporting an error to the user.
 */
export function useSetupStatus() {
  const query = useQuery({
    queryKey: ['setup-status'],
    queryFn: async () => {
      const res = await api.setup.status();
      if (!res.success) {
        if (res.error.code === 'API_UNAVAILABLE' || res.error.code === 'IPC_ERROR') {
          throw new ApiStartingError(res.error.message);
        }
        throw new Error(res.error.message);
      }
      return res.data;
    },
    retry: (failureCount, error) => error instanceof ApiStartingError && failureCount < 24,
    retryDelay: 500,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    ...query,
    required: query.data?.required === true,
    starting: query.isPending && query.failureCount > 0,
  };
}
