import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, type ManagerAccount } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';

export function UsersPage() {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [editorId, setEditorId] = useState<string | null | 'new'>(null);

  const usersQuery = useQuery({
    queryKey: ['managers'],
    queryFn: async () => {
      const res = await api.users.list();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: string | null; values: ManagerFormValues }) => {
      const res = id ? await api.users.update(id, values) : await api.users.create(values);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.id ? 'Manager account updated' : 'Manager account created');
      setEditorId(null);
      void queryClient.invalidateQueries({ queryKey: ['managers'] });
    },
    onError: (err: Error) => toast.error('Account could not be saved', err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.users.remove(id);
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      toast.success('Manager account archived');
      void queryClient.invalidateQueries({ queryKey: ['managers'] });
    },
    onError: (err: Error) => toast.error('Account could not be archived', err.message),
  });

  const setActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await api.users.update(id, { isActive });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.isActive ? 'Account activated' : 'Account deactivated');
      void queryClient.invalidateQueries({ queryKey: ['managers'] });
    },
    onError: (err: Error) => toast.error('Account could not be updated', err.message),
  });

  const managers = usersQuery.data ?? [];
  const editing = editorId === 'new' ? null : findManager(managers, editorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Managers</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Manager accounts for daily operations. New accounts always receive the manager role.
          </p>
        </div>
        <Button onClick={() => setEditorId('new')}>
          <Plus className="h-4 w-4" />
          Add manager
        </Button>
      </div>

      {usersQuery.isError && <ErrorState message={(usersQuery.error as Error).message} />}

      {usersQuery.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-paper-elevated" />
      ) : managers.length === 0 ? (
        <EmptyState
          title="No manager accounts"
          description="Add a manager account so a colleague can manage the menu and create bills."
          action={<Button onClick={() => setEditorId('new')}>Add manager</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Username</TH>
              <TH>Full name</TH>
              <TH>Contact</TH>
              <TH>Status</TH>
              <TH>Last login</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {managers.map((manager) => (
              <TR key={manager.id}>
                <TD className="font-mono text-xs">{manager.username}</TD>
                <TD>{manager.fullName}</TD>
                <TD>
                  <div className="text-sm">{manager.email ?? '—'}</div>
                  {manager.phone && <div className="text-xs text-ink-muted">{manager.phone}</div>}
                </TD>
                <TD>
                  <span
                    className={
                      manager.isActive
                        ? 'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-emerald-900'
                        : 'inline-flex items-center rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-stone-800'
                    }
                  >
                    {manager.isActive ? 'ACTIVE' : 'DISABLED'}
                  </span>
                </TD>
                <TD className="text-sm text-ink-muted">
                  {manager.lastLoginAt ? new Date(manager.lastLoginAt).toLocaleString('en-IN') : 'Never'}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${manager.username}`}
                      onClick={() => setEditorId(manager.id)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setActiveMutation.isPending || manager.id === currentUserId}
                      onClick={() =>
                        setActiveMutation.mutate({ id: manager.id, isActive: !manager.isActive })
                      }
                    >
                      {manager.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Archive ${manager.username}`}
                      disabled={removeMutation.isPending || manager.id === currentUserId}
                      onClick={async () => {
                        const confirmed = await confirmDialog({
                          title: 'Archive manager account',
                          message: `Archive ${manager.username}? The account is disabled and removed from this list. Bill history is kept.`,
                          confirmLabel: 'Archive account',
                          danger: true,
                        });
                        if (confirmed) removeMutation.mutate(manager.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={editorId !== null} onOpenChange={(open) => !open && setEditorId(null)}>
        {editorId !== null && (
          <DialogContent
            title={editing ? `Edit ${editing.username}` : 'Add manager'}
            description="Managers can view the dashboard, manage the menu and create bills. They cannot access analytics, settings or other accounts."
          >
            <ManagerForm
              key={editing?.id ?? 'new'}
              manager={editing}
              saving={saveMutation.isPending}
              onCancel={() => setEditorId(null)}
              onSubmit={(values) => saveMutation.mutate({ id: editing?.id ?? null, values })}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function findManager(managers: ManagerAccount[], id: string | null): ManagerAccount | null {
  if (!id) return null;
  return managers.find((manager) => manager.id === id) ?? null;
}

interface ManagerFormValues {
  username: string;
  fullName: string;
  email: string;
  phone: string;
  password?: string;
  isActive?: boolean;
}

function ManagerForm({
  manager,
  saving,
  onCancel,
  onSubmit,
}: {
  manager: ManagerAccount | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: ManagerFormValues) => void;
}) {
  const [username, setUsername] = useState(manager?.username ?? '');
  const [fullName, setFullName] = useState(manager?.fullName ?? '');
  const [email, setEmail] = useState(manager?.email ?? '');
  const [phone, setPhone] = useState(manager?.phone ?? '');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(manager?.isActive ?? true);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const values: ManagerFormValues = {
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          phone: phone.trim(),
        };
        const trimmedPassword = password.trim();
        if (manager) {
          if (trimmedPassword) values.password = trimmedPassword;
          values.isActive = isActive;
        } else {
          values.password = trimmedPassword;
        }
        onSubmit(values);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="manager-username">Username</Label>
          <Input
            id="manager-username"
            required
            minLength={3}
            maxLength={40}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manager-fullname">Full name</Label>
          <Input
            id="manager-fullname"
            required
            maxLength={120}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manager-email">Email</Label>
          <Input
            id="manager-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="manager-phone">Phone</Label>
          <Input
            id="manager-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="manager-password">
          {manager ? 'New password (leave blank to keep current)' : 'Password'}
        </Label>
        <Input
          id="manager-password"
          type="password"
          required={!manager}
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-ink-muted">At least 8 characters.</p>
      </div>

      {manager && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Account is active
        </label>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : manager ? 'Save changes' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}
