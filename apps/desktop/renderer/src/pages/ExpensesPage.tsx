import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, Textarea } from '@/components/ui/select';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD, EmptyState, ErrorState } from '@/components/ui/table';
import { toast } from '@/stores/toastStore';
import { formatCurrency } from '@/utils/cn';

const expenseSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  amount: z.string().min(1, 'Amount is required'),
  description: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER']),
  expenseDate: z.string().min(1),
});

type ExpenseForm = z.infer<typeof expenseSchema>;

export function ExpensesPage() {
  const [creating, setCreating] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const queryClient = useQueryClient();

  const expensesQuery = useQuery({
    queryKey: ['expenses', from, to, categoryId],
    queryFn: async () => {
      const res = await api.expenses.list({
        from: from || undefined,
        to: to || undefined,
        categoryId: categoryId || undefined,
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const res = await api.expenses.categories();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (values: ExpenseForm) => api.expenses.create(values),
    onSuccess: () => {
      toast.success('Expense recorded');
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (err: Error) => toast.error('Could not save expense', err.message),
  });

  const expenses = expensesQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Expenses</h1>
          <p className="mt-1 text-sm text-ink-muted">Operational expenses by category</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Record Expense
        </Button>
      </div>

      <div className="flex gap-3">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-44" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-44" />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-52">
          <option value="">All categories</option>
          {(categoriesQuery.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      {expensesQuery.isError && <ErrorState message={(expensesQuery.error as Error).message} />}

      {expensesQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-paper-elevated" />
          ))}
        </div>
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No expenses found"
          description="Record operational expenses to track them in reports."
          action={<Button onClick={() => setCreating(true)}>Record Expense</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Date</TH>
              <TH>Category</TH>
              <TH>Description</TH>
              <TH>Method</TH>
              <TH>Recorded by</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {expenses.map((e) => (
              <TR key={e.id}>
                <TD className="text-xs">{new Date(e.expenseDate).toLocaleDateString('en-IN')}</TD>
                <TD className="font-medium">{e.category?.name}</TD>
                <TD>{e.description ?? '—'}</TD>
                <TD>{e.paymentMethod}</TD>
                <TD className="text-xs text-ink-muted">{e.user?.fullName}</TD>
                <TD className="text-right font-medium">{formatCurrency(e.amount)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Record Expense" description="Cash expenses are linked to your open cash session.">
          <ExpenseForm
            categories={categoriesQuery.data ?? []}
            submitting={createMutation.isPending}
            onSubmit={(values) => createMutation.mutate(values)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExpenseForm({
  categories,
  submitting,
  onSubmit,
  onCancel,
}: {
  categories: Array<{ id: string; name: string }>;
  submitting: boolean;
  onSubmit: (values: ExpenseForm) => void;
  onCancel: () => void;
}) {
  const form = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      categoryId: '',
      amount: '',
      description: '',
      paymentMethod: 'CASH',
      expenseDate: new Date().toISOString().slice(0, 10),
    },
  });

  return (
    <form className="space-y-4" onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}>
      <div className="space-y-1.5">
        <Label>Category *</Label>
        <Select {...form.register('categoryId')}>
          <option value="">Select category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        {form.formState.errors.categoryId && (
          <p className="text-xs text-danger">{form.formState.errors.categoryId.message}</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Amount *</Label>
          <Input type="number" step="0.01" min="0" {...form.register('amount')} />
          {form.formState.errors.amount && (
            <p className="text-xs text-danger">{form.formState.errors.amount.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" {...form.register('expenseDate')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Payment method</Label>
        <Select {...form.register('paymentMethod')}>
          {['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'].map((m) => (
            <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Description</Label>
        <Textarea {...form.register('description')} />
      </div>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save expense'}
        </Button>
      </div>
    </form>
  );
}
