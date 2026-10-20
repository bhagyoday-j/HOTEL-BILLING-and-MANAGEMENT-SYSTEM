import { describe, expect, it } from 'vitest';
import { REVENUE_EXCLUDED_STATUSES, isRevenueBill } from './revenue';

describe('isRevenueBill', () => {
  it('counts finalized bill statuses as revenue', () => {
    expect(isRevenueBill('PAID')).toBe(true);
    expect(isRevenueBill('ISSUED')).toBe(true);
    expect(isRevenueBill('PARTIALLY_PAID')).toBe(true);
  });

  it('excludes cancelled bills so a cancellation removes their amount from revenue', () => {
    expect(isRevenueBill('CANCELLED')).toBe(false);
  });

  it('excludes draft and refunded bills too', () => {
    expect(isRevenueBill('DRAFT')).toBe(false);
    expect(isRevenueBill('REFUNDED')).toBe(false);
  });

  it('treats a missing status as non-revenue', () => {
    expect(isRevenueBill(null)).toBe(false);
    expect(isRevenueBill(undefined)).toBe(false);
  });

  it('keeps the shared exclusion list in sync with the helper', () => {
    expect(REVENUE_EXCLUDED_STATUSES).toEqual(['CANCELLED', 'DRAFT', 'REFUNDED']);
    for (const status of REVENUE_EXCLUDED_STATUSES) {
      expect(isRevenueBill(status)).toBe(false);
    }
  });
});
