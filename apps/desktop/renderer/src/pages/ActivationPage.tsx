import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Copy, KeyRound, LogOut } from 'lucide-react';
import { APP_NAME, APP_VERSION, formatLicenseCode } from '@hotel-billing/shared';
import { api } from '@/services/api';
import { useLicenseStatus, licenseQueryKey } from '@/hooks/useLicenseStatus';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/stores/toastStore';

/**
 * Activation / renewal screen. Shown while this PC has no valid subscription:
 * after the one-time setup, and again once the paid year has ended. Business
 * features are blocked server-side until a key is entered.
 */
export function ActivationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const { data: status, isPending, error } = useLicenseStatus();
  const [key, setKey] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const expired = status?.state === 'EXPIRED';

  useEffect(() => {
    if (status?.state === 'ACTIVE') navigate('/', { replace: true });
  }, [status, navigate]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = expired
        ? await api.license.renew(key.trim())
        : await api.license.activate(key.trim());
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData([...licenseQueryKey], data);
      void queryClient.invalidateQueries({ queryKey: [...licenseQueryKey] });
      toast.success(
        expired ? 'Subscription renewed for one year' : 'Software activated for one year',
        data.expiresAt ? `Valid until ${new Date(data.expiresAt).toLocaleDateString('en-IN')}` : undefined,
      );
      navigate('/', { replace: true });
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const copyMachineCode = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.machineCode);
      toast.success('Machine code copied');
    } catch {
      toast.error('Could not copy', 'Select the code and copy it manually.');
    }
  };

  return (
    <div className="relative flex h-full min-h-screen overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #14261f 0%, #1f4d3a 42%, #2a4034 70%, #b08d57 140%)',
        }}
      />
      <div className="relative z-10 flex w-full items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#fffcf7]/95 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6">
            <p className="font-display text-3xl text-forest-deep">
              {expired ? 'Subscription expired' : 'Activate ' + APP_NAME}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              {expired
                ? 'Your one-year subscription has ended. Enter a renewal key to use the software for another year.'
                : 'This installation needs a one-year activation key before billing and reporting can be used.'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">v{APP_VERSION}</p>
          </div>

          {isPending ? (
            <div className="h-40 animate-pulse rounded-lg bg-paper" />
          ) : error ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {(error as Error).message}
            </div>
          ) : status ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-paper px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Machine code</p>
                    <p className="mt-1 font-mono text-lg tracking-wider text-ink">
                      {formatLicenseCode(status.machineCode)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void copyMachineCode()}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  Send this code to the vendor to receive your activation key. The key is bound to
                  this computer and cannot be used on another PC.
                </p>
              </div>

              {expired && status.expiresAt && (
                <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                  Expired on {new Date(status.expiresAt).toLocaleDateString('en-IN')}.
                </div>
              )}

              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormError(null);
                  if (!key.trim()) {
                    setFormError('Enter your activation key.');
                    return;
                  }
                  mutation.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="activation-key">{expired ? 'Renewal key' : 'Activation key'}</Label>
                  <Input
                    id="activation-key"
                    autoComplete="off"
                    autoFocus
                    placeholder="Enter the key provided by the vendor"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <p className="text-xs text-ink-muted">
                    Each key activates {APP_NAME} on this computer for one year.
                  </p>
                </div>

                {formError && (
                  <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {formError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending || !key.trim()}
                >
                  <KeyRound className="h-4 w-4" />
                  {mutation.isPending
                    ? 'Validating…'
                    : expired
                      ? 'Renew for one year'
                      : 'Activate software'}
                </Button>
              </form>

              <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-ink-muted">
                <span>Signed in as {user?.username ?? 'owner'}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void api.auth.logout(user?.id);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
