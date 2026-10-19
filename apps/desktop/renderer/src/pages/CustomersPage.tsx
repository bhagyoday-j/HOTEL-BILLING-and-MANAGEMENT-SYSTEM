import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/services/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatCurrency } from '@/utils/cn';

/**
 * Customer directory. Visit counts are derived from billing history: a
 * customer's visits are the bills billed to their mobile (or name when no
 * mobile was captured), so the figures always match the bills on record.
 */
export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const customersQuery = useQuery({
    queryKey: ['customers', search, page],
    queryFn: async () => {
      const res = await api.customers.list({ search: search || undefined, page, pageSize: 25 });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
  const customers = customersQuery.data?.items ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((customersQuery.data?.total ?? 0) / (customersQuery.data?.pageSize ?? 25)),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Customers</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {customersQuery.data?.total ?? 0} customers — visits are counted from their bills.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-80">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" />
          <Input
            className="pl-9"
            placeholder="Search name or mobile"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {customersQuery.isError && <ErrorState message={(customersQuery.error as Error).message} />}
      {customersQuery.isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-paper-elevated" />
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Customers appear here once bills are created with a name or mobile number."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Customer</TH>
              <TH>Mobile</TH>
              <TH className="text-right">Visits</TH>
              <TH className="text-right">Total spent</TH>
              <TH>Last visit</TH>
              <TH>Last bill</TH>
            </TR>
          </THead>
          <TBody>
            {customers.map((customer) => (
              <TR key={customer.key}>
                <TD>{customer.name ?? 'Unnamed'}</TD>
                <TD>{customer.mobile ?? '—'}</TD>
                <TD className="text-right font-medium">{customer.visits}</TD>
                <TD className="text-right">{formatCurrency(customer.totalSpent)}</TD>
                <TD>{new Date(customer.lastVisit).toLocaleString('en-IN')}</TD>
                <TD className="font-mono text-xs">{customer.lastBillNumber}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <span className="text-ink-muted">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
