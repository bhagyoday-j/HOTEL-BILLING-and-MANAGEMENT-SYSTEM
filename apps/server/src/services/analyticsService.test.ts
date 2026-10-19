import { describe, expect, it } from 'vitest';
import { buildMonthlyRevenueSeries, lastMonthKeys, topSellingDays } from './analyticsService';

function bill(invoiceDate: Date, grandTotal: string) {
  return { invoiceDate, grandTotal };
}

describe('lastMonthKeys', () => {
  it('returns a chronological 12-month window including the current month', () => {
    const keys = lastMonthKeys(new Date(2026, 0, 15), 12);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe('2025-02');
    expect(keys[11]).toBe('2026-01');
  });

  it('rolls across a year boundary', () => {
    const keys = lastMonthKeys(new Date(2026, 2, 1), 3);
    expect(keys).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('buildMonthlyRevenueSeries', () => {
  const keys = ['2026-08', '2026-09', '2026-10'];

  it('groups revenue and bills per month and keeps empty months at zero', () => {
    const series = buildMonthlyRevenueSeries(
      [
        bill(new Date(2026, 8, 5, 10), '100.00'),
        bill(new Date(2026, 8, 20, 18), '50.50'),
        bill(new Date(2026, 9, 1, 12), '20.00'),
      ],
      keys,
    );

    expect(series).toEqual([
      { period: '2026-08', revenue: 0, bills: 0 },
      { period: '2026-09', revenue: 150.5, bills: 2 },
      { period: '2026-10', revenue: 20, bills: 1 },
    ]);
  });

  it('ignores bills outside the requested month window', () => {
    const series = buildMonthlyRevenueSeries(
      [bill(new Date(2026, 6, 1), '999.00'), bill(new Date(2026, 9, 1), '10.00')],
      keys,
    );
    expect(series.reduce((sum, month) => sum + month.revenue, 0)).toBe(10);
  });
});

describe('topSellingDays', () => {
  it('sorts days by revenue and reports bill counts', () => {
    const days = topSellingDays([
      bill(new Date(2026, 9, 1), '100.00'),
      bill(new Date(2026, 9, 2), '300.00'),
      bill(new Date(2026, 9, 3), '50.00'),
    ]);

    expect(days.map((day) => day.period)).toEqual(['2026-10-02', '2026-10-01', '2026-10-03']);
    expect(days[0]).toEqual({ period: '2026-10-02', revenue: 300, bills: 1 });
  });

  it('aggregates multiple bills on the same day and breaks revenue ties by bill count', () => {
    const days = topSellingDays([
      bill(new Date(2026, 9, 1), '100.00'),
      bill(new Date(2026, 9, 1), '100.00'),
      bill(new Date(2026, 9, 2), '200.00'),
    ]);

    expect(days[0]).toEqual({ period: '2026-10-01', revenue: 200, bills: 2 });
    expect(days[1]).toEqual({ period: '2026-10-02', revenue: 200, bills: 1 });
  });

  it('limits the result and handles an empty range', () => {
    const bills = Array.from({ length: 8 }, (_, index) =>
      bill(new Date(2026, 9, index + 1), String((index + 1) * 10)),
    );
    const days = topSellingDays(bills, 5);
    expect(days).toHaveLength(5);
    expect(days[0].revenue).toBe(80);
    expect(topSellingDays([])).toEqual([]);
  });
});
