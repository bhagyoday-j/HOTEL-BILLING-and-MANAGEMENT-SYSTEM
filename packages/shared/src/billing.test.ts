import { describe, expect, it } from 'vitest';
import { calculateBilling } from './billing';

describe('calculateBilling', () => {
  it('calculates CGST/SGST totals deterministically', () => {
    const result = calculateBilling({
      items: [
        {
          quantity: 1,
          unitPrice: '2500',
          cgstRate: '9',
          sgstRate: '9',
        },
      ],
      useIgst: false,
    });

    expect(result.subtotal).toBe('2500.00');
    expect(result.cgst).toBe('225.00');
    expect(result.sgst).toBe('225.00');
    expect(result.grandTotal).toBe('2950.00');
  });

  it('handles fractional currency amounts', () => {
    const result = calculateBilling({
      items: [{ quantity: 1, unitPrice: '99.99', cgstRate: '0', sgstRate: '0' }],
    });
    expect(result.grandTotal).toBe('99.99');
  });

  it('applies an order-level discount and scales tax proportionally', () => {
    const result = calculateBilling({
      items: [{ quantity: 1, unitPrice: '100', cgstRate: '9', sgstRate: '9' }],
      orderDiscountAmount: '10',
    });
    expect(result.itemDiscount).toBe('10.00');
    expect(result.taxableAmount).toBe('90.00');
    expect(result.cgst).toBe('8.10');
    expect(result.sgst).toBe('8.10');
    expect(result.grandTotal).toBe('106.20');
  });

  it('applies a percentage discount', () => {
    const result = calculateBilling({
      items: [{ quantity: 1, unitPrice: '200', cgstRate: '0', sgstRate: '0' }],
      orderDiscountPercent: '10',
    });
    expect(result.itemDiscount).toBe('20.00');
    expect(result.taxableAmount).toBe('180.00');
    expect(result.grandTotal).toBe('180.00');
  });

  it('applies item discounts before tax', () => {
    const result = calculateBilling({
      items: [
        {
          quantity: 2,
          unitPrice: '100',
          discountAmount: '20',
          cgstRate: '9',
          sgstRate: '9',
        },
      ],
    });
    expect(result.grossAmount).toBe('200.00');
    expect(result.itemDiscount).toBe('20.00');
    expect(result.taxableAmount).toBe('180.00');
    expect(result.cgst).toBe('16.20');
    expect(result.sgst).toBe('16.20');
    expect(result.grandTotal).toBe('212.40');
  });
});
