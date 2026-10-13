import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { formatCurrency } from '@/utils/cn';

export function DashboardPage() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await api.dashboardSummary();
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 60_000,
  });

  const data = summaryQuery.data;

  const metrics = [
    { label: "Today's Revenue", value: data ? formatCurrency(data.todayRevenue) : '—' },
    { label: "Today's Bills", value: data?.todayBills ?? '—' },
    { label: 'Check-ins', value: data?.todayCheckIns ?? '—' },
    { label: 'Check-outs', value: data?.todayCheckOuts ?? '—' },
    { label: 'Occupied Rooms', value: data?.occupiedRooms ?? '—' },
    { label: 'Available Rooms', value: data?.availableRooms ?? '—' },
    { label: 'Reserved Rooms', value: data?.reservedRooms ?? '—' },
    { label: 'Restaurant Sales', value: data ? formatCurrency(data.restaurantSales) : '—' },
    { label: 'Cash Collection', value: data ? formatCurrency(data.cashCollection) : '—' },
    { label: 'UPI Collection', value: data ? formatCurrency(data.upiCollection) : '—' },
    { label: 'Card Collection', value: data ? formatCurrency(data.cardCollection) : '—' },
    { label: 'Credit / Due', value: data ? formatCurrency(data.creditAmount) : '—' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-forest-deep">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Live front-office snapshot from the local database.
        </p>
      </div>

      {summaryQuery.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {(summaryQuery.error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label} className={summaryQuery.isLoading ? 'animate-pulse' : undefined}>
            <CardTitle>{m.label}</CardTitle>
            <CardValue>{m.value}</CardValue>
          </Card>
        ))}
      </div>

      <Card>
        <CardTitle>Charts</CardTitle>
        <p className="mt-3 text-sm text-ink-muted">
          Revenue, occupancy and restaurant charts will be wired in Phase 9 with Recharts once
          invoice and POS data flows are complete.
        </p>
      </Card>
    </div>
  );
}
