import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole, Unlock, Vault } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/select';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, THead, TBody, TR, TH, TD, EmptyState, ErrorState } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { confirmDialog } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { useAuthStore } from '@/stores/authStore';
import { formatCurrency } from '@/utils/cn';

export function CashSessionPage() {
  const user = useAuthStore((s) => s.user);
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);
  const queryClient = useQueryClient();

  const currentQuery = useQuery({
    queryKey: ['cash-current'],
    queryFn: async () => {
      const res = await api.cash.current();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['cash-summary', currentQuery.data?.id],
    queryFn: async () => {
      const res = await api.cash.summary(currentQuery.data!.id);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: currentQuery.data?.status === 'OPEN',
    refetchInterval: 30_000,
  });

  const historyQuery = useQuery({
    queryKey: ['cash-history'],
    queryFn: async () => {
      const res = await api.cash.list({});
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cash-current'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['cash-history'] });
  };

  const session = currentQuery.data;
  const isOpen = session?.status === 'OPEN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Cash Session</h1>
          <p className="mt-1 text-sm text-ink-muted">Your cashier shift and drawer reconciliation</p>
        </div>
        {isOpen && (
          <Button variant="danger" onClick={async () => {
            if (await confirmDialog({
              title: 'Close cash session',
              message: 'Count the drawer and enter the actual cash. The session will be closed and reconciled.',
              confirmLabel: 'Continue',
              danger: true,
            })) {
              setClosing(true);
            }
          }}>
            <LockKeyhole className="h-4 w-4" /> Close Session
          </Button>
        )}
      </div>

      {currentQuery.isError && <ErrorState message={(currentQuery.error as Error).message} />}

      {!session || !isOpen ? (
        <EmptyState
          title="No open cash session"
          description="Open a session with your opening drawer cash to start recording sales."
          action={<Button onClick={() => setOpening(true)}><Unlock className="h-4 w-4" /> Open Session</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardTitle>Opening cash</CardTitle>
              <CardValue>{formatCurrency(session.openingCash)}</CardValue>
            </Card>
            <Card>
              <CardTitle>Cash sales</CardTitle>
              <CardValue>{formatCurrency(summaryQuery.data?.cashSales ?? '0')}</CardValue>
            </Card>
            <Card>
              <CardTitle>Cash expenses</CardTitle>
              <CardValue>{formatCurrency(summaryQuery.data?.cashExpenses ?? '0')}</CardValue>
            </Card>
            <Card>
              <CardTitle>Expected in drawer</CardTitle>
              <CardValue>{formatCurrency(summaryQuery.data?.expectedCash ?? '0')}</CardValue>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Session status</CardTitle>
                <div className="mt-1 text-sm text-ink-muted">
                  Opened {new Date(session.openedAt).toLocaleString('en-IN')}
                </div>
              </div>
              <StatusBadge status={session.status} />
            </div>
          </Card>
        </>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-muted">Recent sessions</h2>
        {(historyQuery.data?.items ?? []).length === 0 ? (
          <EmptyState title="No sessions recorded" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Opened</TH>
                <TH>Cashier</TH>
                <TH>Opening</TH>
                <TH>Expected</TH>
                <TH>Actual</TH>
                <TH>Difference</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {(historyQuery.data?.items ?? []).map((s) => (
                <TR key={s.id}>
                  <TD className="text-xs">{new Date(s.openedAt).toLocaleString('en-IN')}</TD>
                  <TD>{s.user?.fullName ?? user?.fullName}</TD>
                  <TD>{formatCurrency(s.openingCash)}</TD>
                  <TD>{s.expectedCash ? formatCurrency(s.expectedCash) : '—'}</TD>
                  <TD>{s.actualCash ? formatCurrency(s.actualCash) : '—'}</TD>
                  <TD className={s.difference && Number(s.difference) !== 0 ? 'font-semibold text-danger' : ''}>
                    {s.difference ? formatCurrency(s.difference) : '—'}
                  </TD>
                  <TD><StatusBadge status={s.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {/* Open session dialog */}
      <Dialog open={opening} onOpenChange={setOpening}>
        <DialogContent title="Open Cash Session" description="Enter the cash in your drawer at shift start.">
          <OpenSessionForm
            submitting={false}
            onSubmit={async (values) => {
              const res = await api.cash.open(values);
              if (res.success) {
                toast.success('Cash session opened');
                setOpening(false);
                invalidate();
              } else {
                toast.error('Could not open session', res.error.message);
              }
            }}
            onCancel={() => setOpening(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Close session dialog */}
      <Dialog open={closing} onOpenChange={setClosing}>
        <DialogContent title="Close Cash Session" description="Reconcile the drawer before closing.">
          <CloseSessionForm
            expected={summaryQuery.data?.expectedCash ?? '0'}
            submitting={false}
            onSubmit={async (values) => {
              if (!session) return;
              const res = await api.cash.close(session.id, values);
              if (res.success) {
                const diff = Number(res.data.difference ?? '0');
                toast.success(
                  'Session closed',
                  diff === 0
                    ? 'Drawer balanced perfectly'
                    : `Difference: ${formatCurrency(diff)}`,
                );
                setClosing(false);
                invalidate();
              } else {
                toast.error('Could not close session', res.error.message);
              }
            }}
            onCancel={() => setClosing(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OpenSessionForm({
  submitting,
  onSubmit,
  onCancel,
}: {
  submitting: boolean;
  onSubmit: (values: { openingCash: string }) => void;
  onCancel: () => void;
}) {
  const [openingCash, setOpeningCash] = useState('');
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ openingCash });
      }}
    >
      <div className="space-y-1.5">
        <Label>Opening cash *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          required
          value={openingCash}
          onChange={(e) => setOpeningCash(e.target.value)}
          placeholder="0.00"
        />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting || !openingCash}>
          <Vault className="h-4 w-4" /> Open session
        </Button>
      </div>
    </form>
  );
}

function CloseSessionForm({
  expected,
  submitting,
  onSubmit,
  onCancel,
}: {
  expected: string;
  submitting: boolean;
  onSubmit: (values: { actualCash: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [actualCash, setActualCash] = useState('');
  const [notes, setNotes] = useState('');
  const diff = Number(actualCash || '0') - Number(expected);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ actualCash, notes: notes || undefined });
      }}
    >
      <div className="rounded-lg border border-border bg-paper p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-muted">Expected cash</span>
          <span className="font-semibold">{formatCurrency(expected)}</span>
        </div>
        {actualCash && (
          <div className="mt-2 flex justify-between">
            <span className="text-ink-muted">Difference</span>
            <span className={diff === 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
              {formatCurrency(diff)}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Actual cash counted *</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          required
          value={actualCash}
          onChange={(e) => setActualCash(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting || !actualCash} variant="danger">
          <LockKeyhole className="h-4 w-4" /> Close session
        </Button>
      </div>
    </form>
  );
}
