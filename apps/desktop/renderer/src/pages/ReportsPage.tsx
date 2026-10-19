import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatCurrency } from '@/utils/cn';
import { useState } from 'react';

export function ReportsPage() {
  const [preset, setPreset] = useState('THIS_MONTH');
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const analyticsQuery = useQuery({
    queryKey: ['analytics-summary', preset, groupBy],
    queryFn: async () => {
      const res = await api.analytics.summary({ preset, groupBy });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
  const data = analyticsQuery.data;
  const maxRevenue = Math.max(0, ...(data?.series.map((point) => point.revenue) ?? []));
  const maxMonthlyRevenue = Math.max(
    0,
    ...(data?.monthlyRevenue.map((point) => point.revenue) ?? []),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-forest-deep">Analytics</h1>
          <p className="mt-1 text-sm text-ink-muted">Finalized bill revenue; cancelled and draft bills are excluded.</p>
        </div>
        <div className="flex gap-2">
          <Select aria-label="Analytics date range" value={preset} onChange={(event) => setPreset(event.target.value)}>
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="THIS_WEEK">This week</option>
            <option value="THIS_MONTH">This month</option>
          </Select>
          <Select aria-label="Analytics grouping" value={groupBy} onChange={(event) => setGroupBy(event.target.value as 'day' | 'week' | 'month')}>
            <option value="day">By day</option>
            <option value="week">By week</option>
            <option value="month">By month</option>
          </Select>
        </div>
      </div>

      {analyticsQuery.isError && <ErrorState message={(analyticsQuery.error as Error).message} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card><CardTitle>Revenue in selected range</CardTitle><CardValue>{data ? formatCurrency(data.totals.revenue) : '—'}</CardValue></Card>
        <Card><CardTitle>Bills in selected range</CardTitle><CardValue>{data?.totals.bills ?? '—'}</CardValue></Card>
        <Card><CardTitle>Average bill</CardTitle><CardValue>{data ? formatCurrency(data.totals.avgBillValue) : '—'}</CardValue></Card>
        <Card><CardTitle>This month</CardTitle><CardValue>{data ? formatCurrency(data.month.revenue) : '—'}</CardValue></Card>
        <Card>
          <CardTitle>Best selling day</CardTitle>
          <CardValue>{data?.bestDay ? formatCurrency(data.bestDay.revenue) : '—'}</CardValue>
          <p className="mt-1 text-xs text-ink-muted">
            {data?.bestDay
              ? `${formatDayPeriod(data.bestDay.period)} · ${data.bestDay.bills} bill${data.bestDay.bills === 1 ? '' : 's'}`
              : 'No sales in this range'}
          </p>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-forest-deep">Revenue trend</h2>
          {data && <span className="text-xs text-ink-muted">{data.range.from} — {data.range.to}</span>}
        </div>
        {data?.series.length ? (
          <div className="space-y-2 rounded-xl border border-border bg-paper-elevated p-4">
            {data.series.map((point) => (
              <div key={point.period} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-xs text-ink-muted">{point.period}</span>
                <div className="h-3 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-forest" style={{ width: `${maxRevenue > 0 ? (point.revenue / maxRevenue) * 100 : 0}%` }} />
                </div>
                <span className="min-w-24 text-right font-medium">{formatCurrency(point.revenue)}</span>
              </div>
            ))}
          </div>
        ) : (
          !analyticsQuery.isLoading && <EmptyState title="No revenue for this period" />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-forest-deep">Monthly revenue</h2>
            <p className="text-xs text-ink-muted">Last 12 months, including the current month.</p>
          </div>
          {data && <span className="text-xs text-ink-muted">Cancelled bills excluded</span>}
        </div>
        {data?.monthlyRevenue.length ? (
          <div className="space-y-2 rounded-xl border border-border bg-paper-elevated p-4">
            {data.monthlyRevenue.map((point) => (
              <div
                key={point.period}
                className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
              >
                <span className="text-xs text-ink-muted">{formatMonthPeriod(point.period)}</span>
                <div className="h-3 overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full rounded-full bg-brass"
                    style={{
                      width: `${maxMonthlyRevenue > 0 ? (point.revenue / maxMonthlyRevenue) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="min-w-24 text-right font-medium">
                  {formatCurrency(point.revenue)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          !analyticsQuery.isLoading && <EmptyState title="No monthly revenue yet" />
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-forest-deep">Best selling days</h2>
          {data && <span className="text-xs text-ink-muted">{data.range.from} — {data.range.to}</span>}
        </div>
        {data?.bestDays.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Day</TH>
                <TH className="text-right">Bills</TH>
                <TH className="text-right">Revenue</TH>
              </TR>
            </THead>
            <TBody>
              {data.bestDays.map((day) => (
                <TR key={day.period}>
                  <TD>{formatDayPeriod(day.period)}</TD>
                  <TD className="text-right">{day.bills}</TD>
                  <TD className="text-right">{formatCurrency(day.revenue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          !analyticsQuery.isLoading && <EmptyState title="No sales in this period" />
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-forest-deep">Best-selling items</h2>
          {data?.bestSellers.length ? (
            <Table>
              <THead><TR><TH>Item</TH><TH className="text-right">Quantity</TH><TH className="text-right">Revenue</TH></TR></THead>
              <TBody>
                {data.bestSellers.map((item) => (
                  <TR key={item.name}><TD>{item.name}</TD><TD className="text-right">{item.quantity}</TD><TD className="text-right">{formatCurrency(item.revenue)}</TD></TR>
                ))}
              </TBody>
            </Table>
          ) : (
            !analyticsQuery.isLoading && <EmptyState title="No item sales in this period" />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-forest-deep">Recent bills</h2>
          {data?.recentBills.length ? (
            <Table>
              <THead><TR><TH>Bill</TH><TH>Customer</TH><TH className="text-right">Total</TH></TR></THead>
              <TBody>
                {data.recentBills.map((bill) => (
                  <TR key={bill.id}><TD className="font-mono text-xs">{bill.billNumber}</TD><TD>{bill.customerName ?? 'Walk-in'}</TD><TD className="text-right">{formatCurrency(bill.total)}</TD></TR>
                ))}
              </TBody>
            </Table>
          ) : (
            !analyticsQuery.isLoading && <EmptyState title="No bills in this period" />
          )}
        </section>
      </div>
      {data && <p className="text-xs text-ink-muted">{data.note}</p>}
    </div>
  );
}

function formatMonthPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, 1).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
}

function formatDayPeriod(period: string): string {
  const [year, month, day] = period.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
