import { describe, expect, it } from 'vitest';
import { compareTableNumbers, computeOrderTotals, lineAmount } from './tableService';

function line(quantity: string, unitPrice: string, taxRate: string) {
  return { quantity, unitPrice, taxRate };
}

describe('lineAmount', () => {
  it('multiplies quantity by the snapshotted unit price with Decimal rounding', () => {
    expect(lineAmount(3, '60.00')).toBe('180.00');
    expect(lineAmount('2', '10.555')).toBe('21.11');
    expect(lineAmount(0, '60.00')).toBe('0.00');
  });
});

describe('compareTableNumbers', () => {
  it('orders T1…T20 naturally instead of lexicographically', () => {
    const sorted = ['T10', 'T2', 'T1', 'T20', 'T3'].sort(compareTableNumbers);
    expect(sorted).toEqual(['T1', 'T2', 'T3', 'T10', 'T20']);
  });

  it('orders plain numeric table names naturally', () => {
    expect(['10', '2', '1'].sort(compareTableNumbers)).toEqual(['1', '2', '10']);
  });
});

describe('computeOrderTotals', () => {
  it('calculates a table bill with CGST/SGST split using the shared engine', () => {
    const totals = computeOrderTotals([line('2', '100.00', '5')], false);

    expect(totals.subtotal).toBe('200.00');
    expect(totals.cgst).toBe('5.00');
    expect(totals.sgst).toBe('5.00');
    expect(totals.totalTax).toBe('10.00');
    expect(totals.grandTotal).toBe('210.00');
  });

  it('uses IGST for interstate table bills', () => {
    const totals = computeOrderTotals([line('3', '50.00', '5')], true);

    expect(totals.subtotal).toBe('150.00');
    expect(totals.cgst).toBe('0.00');
    expect(totals.sgst).toBe('0.00');
    expect(totals.igst).toBe('7.50');
    expect(totals.grandTotal).toBe('157.50');
  });

  it('keeps each line at its own snapshotted price and tax rate', () => {
    const totals = computeOrderTotals(
      [line('1', '120.00', '5'), line('2', '30.00', '12')],
      false,
    );

    // 120 + 60 gross; tax 6.00 + 7.20
    expect(totals.subtotal).toBe('180.00');
    expect(totals.totalTax).toBe('13.20');
    expect(totals.grandTotal).toBe('193.20');
  });

  it('supports fractional whole-number quantities without float drift', () => {
    const totals = computeOrderTotals([line('3', '0.10', '0')], false);
    expect(totals.subtotal).toBe('0.30');
    expect(totals.grandTotal).toBe('0.30');
  });
});
