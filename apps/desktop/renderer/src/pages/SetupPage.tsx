import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { APP_NAME, APP_VERSION } from '@hotel-billing/shared';

const schema = z
  .object({
    hotelName: z.string().trim().min(1, 'Hotel name is required').max(120),
    ownerFullName: z.string().trim().min(1, 'Your name is required').max(120),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(40)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots and dashes are allowed'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

/**
 * First-run setup. Shown while the installation has no owner account, because a fresh
 * install has an empty database and nobody could sign in. The owner chooses their own
 * credentials here — the app never ships a default password.
 */
export function SetupPage() {
  const navigate = useNavigate();
  const setupStatus = useSetupStatus();
  const setLastUsername = useAuthStore((s) => s.setLastUsername);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      hotelName: '',
      ownerFullName: '',
      username: '',
      password: '',
      confirmPassword: '',
    },
  });

  if (!setupStatus.isPending && setupStatus.data && !setupStatus.required) {
    return <Navigate to="/login" replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.setup.complete({
        hotelName: values.hotelName,
        ownerFullName: values.ownerFullName,
        username: values.username,
        password: values.password,
      });
      if (!res.success) {
        setError(res.error.message);
        return;
      }
      setLastUsername(values.username);
      navigate('/login', { replace: true, state: { setupComplete: true } });
    } catch {
      setError('Unable to reach the local service. Please try again.');
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
      <div className="relative z-10 flex w-full items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#fffcf7]/95 p-8 shadow-2xl backdrop-blur">
          <div className="mb-6">
            <p className="font-display text-3xl text-forest-deep">Welcome to {APP_NAME}</p>
            <p className="mt-2 text-sm text-ink-muted">
              One-time setup · v{APP_VERSION}
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              This installation has no accounts yet. Enter your hotel name and create the owner
              account you will sign in with.
            </p>
          </div>

          <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
            <div className="space-y-2">
              <Label htmlFor="hotelName">Hotel name</Label>
              <Input
                id="hotelName"
                placeholder="Hotel Grand Palace"
                autoComplete="organization"
                {...form.register('hotelName')}
              />
              {form.formState.errors.hotelName && (
                <p className="text-xs text-danger">{form.formState.errors.hotelName.message}</p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerFullName">Owner name</Label>
                <Input id="ownerFullName" autoComplete="name" {...form.register('ownerFullName')} />
                {form.formState.errors.ownerFullName && (
                  <p className="text-xs text-danger">
                    {form.formState.errors.ownerFullName.message}
                  </p>
                )}
              </div>

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
                  autoComplete="new-password"
                  {...form.register('password')}
                />
                {form.formState.errors.password && (
                  <p className="text-xs text-danger">{form.formState.errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...form.register('confirmPassword')}
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-xs text-danger">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Setting up…' : 'Create owner account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-muted">
            Keep these credentials safe — they are the owner account for this installation.
          </p>
        </div>
      </div>
    </div>
  );
}
