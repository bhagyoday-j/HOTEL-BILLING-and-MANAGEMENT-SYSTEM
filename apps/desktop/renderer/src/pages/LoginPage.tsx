import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { APP_NAME, APP_VERSION } from '@hotel-billing/shared';
import { useState } from 'react';

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setupStatus = useSetupStatus();
  const user = useAuthStore((s) => s.user);
  const lastUsername = useAuthStore((s) => s.lastUsername);
  const setSession = useAuthStore((s) => s.setSession);
  const setLastUsername = useAuthStore((s) => s.setLastUsername);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: lastUsername, password: '' },
  });

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  // A fresh installation has no accounts: send the user to first-run setup.
  if (setupStatus.required) {
    return <Navigate to="/setup" replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.auth.login(values.username, values.password);
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setLastUsername(values.username);
      setSession(res.data.user, res.data.token);
      navigate('/', { replace: true });
    } catch {
      setError('Unable to reach local server. Ensure the application backend is running.');
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <div className="relative flex h-full min-h-screen overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #14261f 0%, #1f4d3a 42%, #2a4034 70%, #b08d57 140%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12), transparent 35%), radial-gradient(circle at 80% 0%, rgba(176,141,87,0.35), transparent 40%)',
        }}
      />

      <div className="relative z-10 flex w-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#fffcf7]/95 p-8 shadow-2xl backdrop-blur">
          <div className="mb-8">
            <p className="font-display text-4xl text-forest-deep">{APP_NAME}</p>
            <p className="mt-2 text-sm text-ink-muted">
              Secure offline front-office access · v{APP_VERSION}
            </p>
          </div>

          <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" autoComplete="username" {...form.register('username')} />
              {form.formState.errors.username && (
                <p className="text-xs text-danger">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            {(location.state as { setupComplete?: boolean } | null)?.setupComplete && (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                Setup complete. Sign in with the owner account you just created.
              </div>
            )}

            {setupStatus.starting && (
              <div className="rounded-md border border-border bg-paper px-3 py-2 text-sm text-ink-muted">
                Starting the local service…
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-muted">
            Offline local sign-in. Contact the owner account holder for access.
          </p>
        </div>
      </div>
    </div>
  );
}
