import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_VERSION } from '@hotel-billing/shared';
import {
  DownloadCloud,
  FolderOpen,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  Save,
} from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, Textarea } from '@/components/ui/select';
import { Card, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { useLicenseStatus } from '@/hooks/useLicenseStatus';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const;
const ROUNDING_MODES = [
  { value: 'NONE', label: 'None (exact paise)' },
  { value: 'NEAREST', label: 'Nearest rupee' },
  { value: 'UP', label: 'Round up' },
  { value: 'DOWN', label: 'Round down' },
] as const;
const BACKUP_FREQUENCIES = [
  { value: 'NEVER', label: 'Never' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'EVERY_6_HOURS', label: 'Every 6 hours' },
  { value: 'EVERY_12_HOURS', label: 'Every 12 hours' },
  { value: 'ON_CLOSE', label: 'On application close' },
] as const;

interface ProfileForm {
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  pan: string;
}

const EMPTY_PROFILE: ProfileForm = {
  name: '',
  address: '',
  city: '',
  state: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  gstin: '',
  pan: '',
};

/**
 * Subscription summary: how long is left, when it expires and the machine code
 * needed to renew. Renewal itself happens on the activation screen, which opens
 * automatically once the paid year ends.
 */
function SubscriptionCard() {
  const license = useLicenseStatus();
  const data = license.data;

  const stateLabel =
    data?.state === 'ACTIVE' ? 'Active' : data?.state === 'EXPIRED' ? 'Expired' : 'Not activated';
  const stateClass =
    data?.state === 'ACTIVE'
      ? 'border-success/30 bg-success/10 text-success'
      : 'border-danger/30 bg-danger/10 text-danger';

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Subscription</CardTitle>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${stateClass}`}>
          {license.isPending ? 'Checking…' : stateLabel}
        </span>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Expires on</p>
          <p className="mt-1 font-medium text-ink">
            {data?.expiresAt ? new Date(data.expiresAt).toLocaleDateString('en-IN') : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Time remaining</p>
          <p className="mt-1 font-medium text-ink">
            {data?.expiresAt
              ? `${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} left`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-muted">Machine code</p>
          <p className="mt-1 font-mono text-ink">{data?.machineCode ?? '—'}</p>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        Send the machine code to your vendor to renew. A renewal key adds another 12 months and is
        requested automatically when the subscription expires.
      </p>
    </Card>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['hotel-profile'],
    queryFn: async () => {
      const res = await api.hotel.get();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
  const settingsQuery = useQuery({
    queryKey: ['hotel-settings'],
    queryFn: async () => {
      const res = await api.hotel.getSettings();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const [profile, setProfile] = useState<ProfileForm>(EMPTY_PROFILE);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!profileQuery.data) return;
    setProfile({
      name: profileQuery.data.name ?? '',
      address: profileQuery.data.address ?? '',
      city: profileQuery.data.city ?? '',
      state: profileQuery.data.state ?? '',
      country: profileQuery.data.country ?? '',
      phone: profileQuery.data.phone ?? '',
      email: profileQuery.data.email ?? '',
      website: profileQuery.data.website ?? '',
      gstin: profileQuery.data.gstin ?? '',
      pan: profileQuery.data.pan ?? '',
    });
  }, [profileQuery.data]);

  useEffect(() => {
    if (settingsQuery.data) setSettings(settingsQuery.data);
  }, [settingsQuery.data]);

  const saveProfileMutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const res = await api.settings.updateHotel({
        ...values,
        name: values.name.trim(),
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Hotel profile saved');
      void queryClient.invalidateQueries({ queryKey: ['hotel-profile'] });
      void queryClient.invalidateQueries({ queryKey: ['hotel'] });
    },
    onError: (err: Error) => toast.error('Hotel profile could not be saved', err.message),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      const res = await api.settings.update(values);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Settings saved');
      void queryClient.invalidateQueries({ queryKey: ['hotel-settings'] });
    },
    onError: (err: Error) => toast.error('Settings could not be saved', err.message),
  });

  const setSetting = (key: string, value: string) =>
    setSettings((current) => ({ ...current, [key]: value }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Hotel details, billing defaults and local backups.
        </p>
      </div>

      {profileQuery.isError && <ErrorState message={(profileQuery.error as Error).message} />}
      {settingsQuery.isError && <ErrorState message={(settingsQuery.error as Error).message} />}

      <SubscriptionCard />

      <UpdatesSection />

      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Hotel profile</CardTitle>
          <span className="text-xs text-ink-muted">Shown on printed invoices and receipts</span>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveProfileMutation.mutate(profile);
          }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hotel-name">Hotel name</Label>
            <Input
              id="hotel-name"
              required
              maxLength={160}
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="hotel-address">Address</Label>
            <Input
              id="hotel-address"
              value={profile.address}
              onChange={(event) => setProfile({ ...profile, address: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-city">City</Label>
            <Input
              id="hotel-city"
              value={profile.city}
              onChange={(event) => setProfile({ ...profile, city: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-state">State</Label>
            <Input
              id="hotel-state"
              value={profile.state}
              onChange={(event) => setProfile({ ...profile, state: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-country">Country</Label>
            <Input
              id="hotel-country"
              value={profile.country}
              onChange={(event) => setProfile({ ...profile, country: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-phone">Phone</Label>
            <Input
              id="hotel-phone"
              value={profile.phone}
              onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-email">Email</Label>
            <Input
              id="hotel-email"
              type="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-website">Website</Label>
            <Input
              id="hotel-website"
              value={profile.website}
              onChange={(event) => setProfile({ ...profile, website: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-gstin">GSTIN</Label>
            <Input
              id="hotel-gstin"
              placeholder="22AAAAA0000A1Z5"
              value={profile.gstin}
              onChange={(event) => setProfile({ ...profile, gstin: event.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hotel-pan">PAN</Label>
            <Input
              id="hotel-pan"
              placeholder="AAAAA0000A"
              value={profile.pan}
              onChange={(event) => setProfile({ ...profile, pan: event.target.value.toUpperCase() })}
            />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={saveProfileMutation.isPending || profileQuery.isLoading}>
              <Save className="h-4 w-4" />
              {saveProfileMutation.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="space-y-4">
        <CardTitle>Billing &amp; tax defaults</CardTitle>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const payload: Record<string, string> = {};
            const keys = [
              'currency',
              'invoicePrefix',
              'invoiceNumberFormat',
              'receiptFooter',
              'termsAndConditions',
              'cgstRate',
              'sgstRate',
              'igstRate',
              'useIgst',
              'roundingMode',
              'backupFrequency',
              'backupKeepCount',
            ];
            for (const key of keys) {
              if (settings[key] !== undefined) payload[key] = settings[key];
            }
            saveSettingsMutation.mutate(payload);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="setting-currency">Currency</Label>
              <Select
                id="setting-currency"
                value={settings.currency ?? 'INR'}
                onChange={(event) => setSetting('currency', event.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-invoice-prefix">Invoice prefix</Label>
              <Input
                id="setting-invoice-prefix"
                maxLength={12}
                value={settings.invoicePrefix ?? ''}
                placeholder="INV"
                onChange={(event) => setSetting('invoicePrefix', event.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-rounding">Rounding</Label>
              <Select
                id="setting-rounding"
                value={settings.roundingMode ?? 'NONE'}
                onChange={(event) => setSetting('roundingMode', event.target.value)}
              >
                {ROUNDING_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="setting-cgst">CGST rate (%)</Label>
              <Input
                id="setting-cgst"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.cgstRate ?? ''}
                onChange={(event) => setSetting('cgstRate', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-sgst">SGST rate (%)</Label>
              <Input
                id="setting-sgst"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.sgstRate ?? ''}
                onChange={(event) => setSetting('sgstRate', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-igst">IGST rate (%)</Label>
              <Input
                id="setting-igst"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={settings.igstRate ?? ''}
                onChange={(event) => setSetting('igstRate', event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={settings.useIgst === 'true'}
              onChange={(event) => setSetting('useIgst', event.target.checked ? 'true' : 'false')}
            />
            Use IGST instead of CGST + SGST
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="setting-receipt-footer">Receipt footer</Label>
            <Textarea
              id="setting-receipt-footer"
              maxLength={300}
              value={settings.receiptFooter ?? ''}
              placeholder="Thank you for dining with us"
              onChange={(event) => setSetting('receiptFooter', event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="setting-terms">Terms &amp; conditions</Label>
            <Textarea
              id="setting-terms"
              maxLength={1000}
              value={settings.termsAndConditions ?? ''}
              onChange={(event) => setSetting('termsAndConditions', event.target.value)}
            />
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setting-backup-frequency">Automatic backup frequency</Label>
              <Select
                id="setting-backup-frequency"
                value={settings.backupFrequency ?? 'DAILY'}
                onChange={(event) => setSetting('backupFrequency', event.target.value)}
              >
                {BACKUP_FREQUENCIES.map((frequency) => (
                  <option key={frequency.value} value={frequency.value}>
                    {frequency.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setting-backup-keep">Backups to keep</Label>
              <Input
                id="setting-backup-keep"
                type="number"
                min="1"
                max="365"
                value={settings.backupKeepCount ?? ''}
                placeholder="30"
                onChange={(event) => setSetting('backupKeepCount', event.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saveSettingsMutation.isPending || settingsQuery.isLoading}>
              <Save className="h-4 w-4" />
              {saveSettingsMutation.isPending ? 'Saving…' : 'Save settings'}
            </Button>
          </div>
        </form>
      </Card>

      <AccountSection />

      <BackupsSection />
    </div>
  );
}

const UPDATE_PHASE_LABELS: Record<string, string> = {
  idle: 'Not checked yet',
  checking: 'Checking…',
  'up-to-date': 'Up to date',
  available: 'Update available',
  downloading: 'Downloading…',
  downloaded: 'Ready to install',
  installing: 'Restarting…',
  error: 'Update check failed',
  unsupported: 'Updates unavailable in this build',
};

function updateBadgeClass(phase: string | undefined): string {
  if (phase === 'error') return 'border-danger/30 bg-danger/10 text-danger';
  if (phase === 'downloaded' || phase === 'up-to-date') return 'border-success/30 bg-success/10 text-success';
  if (phase === 'available' || phase === 'downloading' || phase === 'installing') {
    return 'border-brass/30 bg-brass/10 text-brass';
  }
  return 'border-border bg-paper text-ink-muted';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

/**
 * In-app updates. The main process checks GitHub Releases in the background;
 * this card reports the state and lets the user install a downloaded update
 * with an explicit restart. Data under %APPDATA% is not touched by an update.
 */
function UpdatesSection() {
  const status = useUpdateStatus();
  const isDesktop = typeof window !== 'undefined' && Boolean(window.api);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const phase = status?.phase;
  const busy = checking || phase === 'checking' || phase === 'downloading' || phase === 'installing';

  const check = async (): Promise<void> => {
    setChecking(true);
    try {
      const res = await api.updates.check();
      if (!res.success) {
        toast.error('Update check failed', res.error.message);
      } else if (res.data.phase === 'up-to-date') {
        toast.success('You are up to date', `Version ${res.data.currentVersion} is the latest version.`);
      }
    } catch (err) {
      toast.error(
        'Update check failed',
        err instanceof Error ? err.message : 'The update service is not reachable.',
      );
    } finally {
      setChecking(false);
    }
  };

  const install = async (): Promise<void> => {
    const confirmed = await confirmDialog({
      title: 'Restart and install update',
      message: `Version ${status?.availableVersion ?? ''} is ready. The application will close and reopen. Your database and backups stay in place.`,
      confirmLabel: 'Restart and install',
    });
    if (!confirmed) return;

    setInstalling(true);
    const res = await api.updates.install();
    if (!res.success) {
      setInstalling(false);
      toast.error('Update could not be installed', res.error.message);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Application updates</CardTitle>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${updateBadgeClass(phase)}`}
        >
          {UPDATE_PHASE_LABELS[phase ?? 'idle'] ?? 'Unknown'}
        </span>
      </div>

      {!isDesktop ? (
        <p className="rounded-lg border border-dashed border-border bg-paper px-4 py-3 text-sm text-ink-muted">
          Update checks run in the installed desktop application. Open Settings there to check for
          and install updates.
        </p>
      ) : status && !status.supported ? (
        <p className="rounded-lg border border-dashed border-border bg-paper px-4 py-3 text-sm text-ink-muted">
          Update checks are available in the installed Windows application. This build runs in
          development mode and never contacts the update server.
        </p>
      ) : (
        <>
          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Installed version</p>
              <p className="mt-1 font-medium text-ink">
                {status?.currentVersion ?? APP_VERSION}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Available version</p>
              <p className="mt-1 font-medium text-ink">{status?.availableVersion ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted">Automatic check</p>
              <p className="mt-1 font-medium text-ink">On every start</p>
            </div>
          </div>

          {phase === 'downloading' && status?.progress && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-brass transition-[width] duration-300"
                  style={{ width: `${status.progress.percent}%` }}
                />
              </div>
              <p className="text-xs text-ink-muted">
                {status.progress.percent.toFixed(0)}% of {formatBytes(status.progress.total)}
                {status.progress.bytesPerSecond > 0
                  ? ` · ${formatBytes(status.progress.bytesPerSecond)}/s`
                  : ''}
              </p>
            </div>
          )}

          {phase === 'error' && status?.message && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {status.message}
            </div>
          )}

          {phase === 'downloaded' && (
            <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              Version {status?.availableVersion} has been downloaded. Restart the application to
              install it. Your bills, menu and settings are kept.
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy || phase === 'downloaded'} onClick={() => void check()}>
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking…' : 'Check for updates'}
            </Button>
            <Button
              disabled={phase !== 'downloaded' || installing}
              onClick={() => void install()}
            >
              <DownloadCloud className="h-4 w-4" />
              {installing || phase === 'installing' ? 'Restarting…' : 'Restart and install'}
            </Button>
          </div>

          <p className="text-xs text-ink-muted">
            Updates are downloaded in the background from GitHub Releases and are only installed
            when you choose to restart. An internet connection is required to check; the app keeps
            working offline.
          </p>
        </>
      )}
    </Card>
  );
}

/**
 * The owner account cannot be edited from the manager-accounts page (that endpoint only
 * accepts MANAGER accounts), so this is where the signed-in user rotates their password.
 */
function AccountSection() {
  const username = useAuthStore((s) => s.user?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const res = await api.auth.changePassword(currentPassword, newPassword);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFormError(null);
      toast.success('Password changed', 'Use the new password next time you sign in.');
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setFormError(null);
    if (newPassword.length < 8) {
      setFormError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('New passwords do not match');
      return;
    }
    changePasswordMutation.mutate();
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle>Account &amp; password</CardTitle>
        <span className="text-xs text-ink-muted">Signed in as {username || '—'}</span>
      </div>

      <form className="grid gap-4 sm:grid-cols-3" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        {formError && (
          <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-3">
            {formError}
          </div>
        )}

        <div className="sm:col-span-3">
          <Button type="submit" disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function BackupsSection() {
  const queryClient = useQueryClient();
  const isDesktop = typeof window !== 'undefined' && Boolean(window.api);
  const backupsQuery = useQuery({
    queryKey: ['backups'],
    enabled: isDesktop,
    queryFn: async () => {
      const res = await api.backup.list();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.backup.create();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Backup created');
      void queryClient.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err: Error) => toast.error('Backup could not be created', err.message),
  });

  const restoreMutation = useMutation({
    mutationFn: async (filePath: string) => {
      const res = await api.backup.restore(filePath);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Backup restored', 'Restart the application to reopen the restored database.');
    },
    onError: (err: Error) => toast.error('Restore failed', err.message),
  });

  const backups = backupsQuery.data ?? [];

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Backups</CardTitle>
        {isDesktop && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void api.backup.openFolder()}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Open folder
            </Button>
            <Button size="sm" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
              <HardDriveDownload className="h-3.5 w-3.5" />
              {createMutation.isPending ? 'Creating…' : 'Create backup'}
            </Button>
          </div>
        )}
      </div>

      {!isDesktop ? (
        <p className="rounded-lg border border-dashed border-border bg-paper px-4 py-3 text-sm text-ink-muted">
          Backups run in the desktop application, where the local database file can be copied safely.
          Open Settings in the installed app to create or restore a backup.
        </p>
      ) : backupsQuery.isError ? (
        <ErrorState message={(backupsQuery.error as Error).message} />
      ) : backups.length === 0 ? (
        !backupsQuery.isLoading && (
          <EmptyState
            title="No backups yet"
            description="Create a manual backup, or set a backup frequency above."
          />
        )
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>File</TH>
              <TH>Created</TH>
              <TH className="text-right">Size</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {backups.map((backup) => (
              <TR key={backup.filePath}>
                <TD className="font-mono text-xs">{backup.fileName}</TD>
                <TD>{new Date(backup.createdAt).toLocaleString('en-IN')}</TD>
                <TD className="text-right">{formatFileSize(backup.fileSize)}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restoreMutation.isPending}
                    onClick={async () => {
                      const confirmed = await confirmDialog({
                        title: 'Restore backup',
                        message:
                          'Restore this backup? The current database will be replaced. A safety backup is created first and the app must be restarted afterwards.',
                        confirmLabel: 'Restore backup',
                        danger: true,
                      });
                      if (confirmed) restoreMutation.mutate(backup.filePath);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <p className="text-xs text-ink-muted">
        Backups can also be exported to a USB drive or external folder from the desktop app.
      </p>
    </Card>
  );
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
