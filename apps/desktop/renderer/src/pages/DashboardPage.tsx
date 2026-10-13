import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatCurrency } from '@/utils/cn';

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await api.dashboard.summary();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const data = summaryQuery.data;
  const metrics = [
    { label: "Today's Revenue", value: data ? formatCurrency(data.today.revenue) : '—' },
    { label: "Today's Bills", value: data?.today.bills ?? '—' },
    { label: 'Revenue This Month', value: data?.financials ? formatCurrency(data.financials.monthRevenue) : 'Owner only' },
    { label: 'All-time Revenue', value: data?.financials ? formatCurrency(data.financials.totalRevenue) : 'Owner only' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">A live summary of today&apos;s billing activity.</p>
      </div>

      {summaryQuery.isError && <ErrorState message={(summaryQuery.error as Error).message} />}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className={summaryQuery.isLoading ? 'animate-pulse' : undefined}>
            <CardTitle>{metric.label}</CardTitle>
            <CardValue>{metric.value}</CardValue>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-forest-deep">Recent bills</h2>
        {data?.recentBills.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Bill</TH>
                <TH>Date</TH>
                <TH>Customer</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {data.recentBills.map((bill) => (
                <TR key={bill.id}>
                  <TD className="font-mono text-xs">{bill.billNumber}</TD>
                  <TD>{new Date(bill.date).toLocaleDateString('en-IN')}</TD>
                  <TD>{bill.customerName ?? 'Walk-in'}</TD>
                  <TD>{bill.status.replace(/_/g, ' ')}</TD>
                  <TD className="text-right">{formatCurrency(bill.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          !summaryQuery.isLoading && <EmptyState title="No recent bills" description="Bills will appear here after a sale." />
        )}
      </section>
    </div>
  );
}
