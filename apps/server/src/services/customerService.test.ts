import { describe, expect, it } from 'vitest';
import { customerKey, summarizeCustomers, type RawBillForCustomer } from './customerService';

function bill(overrides: Partial<RawBillForCustomer>): RawBillForCustomer {
  return {
    invoiceNumber: 'INV-2026-000001',
    guestName: null,
    guestMobile: null,
    grandTotal: '100',
    status: 'PAID',
    invoiceDate: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  };
}

describe('customerKey', () => {
  it('prefers a normalized mobile number', () => {
    expect(customerKey('Alice', '+91 98765 43210')).toBe('mobile:919876543210');
  });

  it('falls back to a normalized name when no usable mobile', () => {
    expect(customerKey('  Alice   Smith ', '123')).toBe('name:alice smith');
  });

  it('returns null for anonymous walk-ins', () => {
    expect(customerKey(null, null)).toBeNull();
    expect(customerKey('   ', '12')).toBeNull();
  });
});

describe('summarizeCustomers', () => {
  it('counts visits and sums spend per customer', () => {
    const summaries = summarizeCustomers([
      bill({ guestName: 'Alice', guestMobile: '9876543210', grandTotal: '250', invoiceDate: new Date('2026-10-01T10:00:00Z') }),
      bill({ guestName: 'Alice', guestMobile: '9876543210', grandTotal: '150', invoiceNumber: 'INV-2026-000002', invoiceDate: new Date('2026-10-03T10:00:00Z') }),
      bill({ guestName: 'Bob', guestMobile: '9123456780', grandTotal: '500' }),
    ]);

    const alice = summaries.find((c) => c.mobile === '9876543210');
    expect(alice?.visits).toBe(2);
    expect(alice?.totalSpent).toBe('400.00');
    expect(alice?.lastBillNumber).toBe('INV-2026-000002');
  });

  it('counts cancelled bills as visits but excludes them from spend', () => {
    const summaries = summarizeCustomers([
      bill({ guestMobile: '9876543210', grandTotal: '200' }),
      bill({ guestMobile: '9876543210', grandTotal: '999', status: 'CANCELLED', invoiceNumber: 'INV-2026-000002' }),
    ]);

    expect(summaries[0]?.visits).toBe(2);
    expect(summaries[0]?.totalSpent).toBe('200.00');
  });

  it('groups by name when no mobile is captured and ignores anonymous bills', () => {
    const summaries = summarizeCustomers([
      bill({ guestName: 'Ravi', grandTotal: '100' }),
      bill({ guestName: 'ravi', grandTotal: '100', invoiceNumber: 'INV-2026-000002' }),
      bill({ guestName: null, guestMobile: null }),
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.visits).toBe(2);
    expect(summaries[0]?.totalSpent).toBe('200.00');
  });

  it('keeps name-only and mobile-only records as separate customers', () => {
    // A bill with the mobile and one without are different identities: the
    // mobile-keyed record wins when present, the name-only one stands alone.
    const summaries = summarizeCustomers([
      bill({ guestName: 'Alice', guestMobile: '9876543210', grandTotal: '100' }),
      bill({ guestName: 'Alice', guestMobile: null, grandTotal: '50', invoiceNumber: 'INV-2026-000002' }),
    ]);

    expect(summaries).toHaveLength(2);
  });

  it('sorts customers by most recent visit', () => {
    const summaries = summarizeCustomers([
      bill({ guestMobile: '9000000001', invoiceDate: new Date('2026-10-01T10:00:00Z') }),
      bill({ guestMobile: '9000000002', invoiceDate: new Date('2026-10-05T10:00:00Z') }),
    ]);
    expect(summaries[0]?.mobile).toBe('9000000002');
  });
});
