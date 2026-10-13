import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Search, Pencil, Archive } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/select';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD, EmptyState, ErrorState } from '@/components/ui/table';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { formatCurrency } from '@/utils/cn';

const guestSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  mobile: z
    .string()
    .regex(/^(\+\d{1,3}[\s-]?)?\d{10}$/, 'Enter a valid 10-digit mobile number')
    .optional()
    .or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  nationality: z.string().optional(),
  notes: z.string().optional(),
});

type GuestForm = z.infer<typeof guestSchema>;

export function GuestsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<GuestForm & { id?: string } | null>(null);
  const queryClient = useQueryClient();

  const guestsQuery = useQuery({
    queryKey: ['guests', search, page],
    queryFn: async () => {
      const res = await api.guests.list({ search, page, pageSize: 25 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: GuestForm & { id?: string }) => {
      if (values.id) {
        return api.guests.update(values.id, values);
      }
      return api.guests.create(values);
    },
    onSuccess: (_, vars) => {
      toast.success(vars.id ? 'Guest updated' : 'Guest created');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['guests'] });
    },
    onError: (err: Error) => toast.error('Could not save guest', err.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.guests.remove(id),
    onSuccess: () => {
      toast.success('Guest archived');
      void queryClient.invalidateQueries({ queryKey: ['guests'] });
    },
    onError: (err: Error) => toast.error('Could not archive guest', err.message),
  });

  const guests = guestsQuery.data?.items ?? [];
  const total = guestsQuery.data?.total ?? 0;
  const pageSize = guestsQuery.data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Guests</h1>
          <p className="mt-1 text-sm text-ink-muted">{total} guest records</p>
        </div>
        <Button onClick={() => setEditing({ fullName: '' })}>
          <Plus className="h-4 w-4" /> New Guest
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder="Search name, mobile, ID number…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      {guestsQuery.isError && <ErrorState message={(guestsQuery.error as Error).message} />}

      {guestsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-paper-elevated" />
          ))}
        </div>
      ) : guests.length === 0 ? (
        <EmptyState
          title="No guests found"
          description={search ? 'Try a different search term.' : 'Add your first guest to create bookings.'}
          action={<Button onClick={() => setEditing({ fullName: '' })}>Add Guest</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Name</TH>
              <TH>Mobile</TH>
              <TH>City</TH>
              <TH>ID</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {guests.map((g) => (
              <TR key={g.id}>
                <TD className="font-medium">{g.fullName}</TD>
                <TD>{g.mobile ?? '—'}</TD>
                <TD>{g.city ?? '—'}</TD>
                <TD>{g.idNumber ?? '—'}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditing({
                          id: g.id,
                          fullName: g.fullName,
                          mobile: g.mobile ?? '',
                          email: g.email ?? '',
                          address: g.address ?? '',
                          city: g.city ?? '',
                          state: g.state ?? '',
                          idType: g.idType ?? '',
                          idNumber: g.idNumber ?? '',
                          nationality: g.nationality ?? '',
                          notes: g.notes ?? '',
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={async () => {
                        if (
                          await confirmDialog({
                            title: 'Archive guest',
                            message: `Archive ${g.fullName}? Their booking and invoice history is preserved.`,
                            confirmLabel: 'Archive',
                            danger: true,
                          })
                        ) {
                          archiveMutation.mutate(g.id);
                        }
                      }}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent
            title={editing.id ? 'Edit Guest' : 'New Guest'}
            description="Guest information is stored locally and used for bookings and invoices."
            wide
          >
            <GuestForm
              initial={editing}
              submitting={saveMutation.isPending}
              onSubmit={(values) => saveMutation.mutate(values)}
              onCancel={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function GuestForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: GuestForm & { id?: string };
  submitting: boolean;
  onSubmit: (values: GuestForm) => void;
  onCancel: () => void;
}) {
  const form = useForm<GuestForm>({
    resolver: zodResolver(guestSchema),
    defaultValues: initial,
  });

  return (
    <form className="grid grid-cols-2 gap-4" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="g-name">Full name *</Label>
        <Input id="g-name" {...form.register('fullName')} />
        {form.formState.errors.fullName && (
          <p className="text-xs text-danger">{form.formState.errors.fullName.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-mobile">Mobile</Label>
        <Input id="g-mobile" placeholder="10-digit number" {...form.register('mobile')} />
        {form.formState.errors.mobile && (
          <p className="text-xs text-danger">{form.formState.errors.mobile.message}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-email">Email</Label>
        <Input id="g-email" type="email" {...form.register('email')} />
        {form.formState.errors.email && (
          <p className="text-xs text-danger">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="g-address">Address</Label>
        <Input id="g-address" {...form.register('address')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-city">City</Label>
        <Input id="g-city" {...form.register('city')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-state">State</Label>
        <Input id="g-state" {...form.register('state')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-idtype">ID type</Label>
        <select
          id="g-idtype"
          className="h-9 w-full rounded-lg border border-border bg-paper-elevated px-3 text-sm"
          {...form.register('idType')}
        >
          <option value="">—</option>
          <option>Aadhaar</option>
          <option>Passport</option>
          <option>Driving License</option>
          <option>Voter ID</option>
          <option>Other</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-idnumber">ID number</Label>
        <Input id="g-idnumber" {...form.register('idNumber')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="g-nationality">Nationality</Label>
        <Input id="g-nationality" defaultValue="India" {...form.register('nationality')} />
      </div>
      <div className="col-span-2 space-y-1.5">
        <Label htmlFor="g-notes">Notes</Label>
        <Textarea id="g-notes" {...form.register('notes')} />
      </div>
      <div className="col-span-2 mt-2 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save Guest'}
        </Button>
      </div>
    </form>
  );
}

// Re-export for potential reuse
export { formatCurrency, Card, CardTitle, CardValue };
