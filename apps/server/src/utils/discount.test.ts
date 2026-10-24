import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { assertDiscountWithinSubtotal, resolveOrderDiscount } from './discount';

describe('resolveOrderDiscount', () => {
  it('accepts a discount amount or a percentage', () => {
    expect(resolveOrderDiscount({ discountAmount: '50' })).toEqual({ orderDiscountAmount: '50' });
    expect(resolveOrderDiscount({ discountPercent: '10.5' })).toEqual({
      orderDiscountPercent: '10.5',
    });
  });

  it('treats empty and zero values as no discount', () => {
    expect(resolveOrderDiscount({})).toEqual({});
    expect(resolveOrderDiscount({ discountAmount: '', discountPercent: '   ' })).toEqual({});
    expect(resolveOrderDiscount({ discountAmount: '0.00' })).toEqual({});
    expect(resolveOrderDiscount({ discountPercent: '0' })).toEqual({});
  });

  it('rejects supplying both an amount and a percentage', () => {
    expect(() =>
      resolveOrderDiscount({ discountAmount: '10', discountPercent: '5' }),
    ).toThrow(AppError);
  });

  it('rejects malformed, negative or excessive values', () => {
    expect(() => resolveOrderDiscount({ discountAmount: 'abc' })).toThrow(AppError);
    expect(() => resolveOrderDiscount({ discountAmount: '-5' })).toThrow(AppError);
    expect(() => resolveOrderDiscount({ discountAmount: '10.555' })).toThrow(AppError);
    expect(() => resolveOrderDiscount({ discountPercent: '100.01' })).toThrow(AppError);
  });

  it('accepts a full 100% discount', () => {
    expect(resolveOrderDiscount({ discountPercent: '100' })).toEqual({
      orderDiscountPercent: '100',
    });
  });
});

describe('assertDiscountWithinSubtotal', () => {
  it('allows an amount equal to the subtotal', () => {
    expect(() =>
      assertDiscountWithinSubtotal({ orderDiscountAmount: '100.00' }, '100.00'),
    ).not.toThrow();
  });

  it('rejects an amount above the subtotal', () => {
    expect(() =>
      assertDiscountWithinSubtotal({ orderDiscountAmount: '100.01' }, '100.00'),
    ).toThrow(AppError);
  });

  it('does not limit percentage discounts by the subtotal', () => {
    expect(() =>
      assertDiscountWithinSubtotal({ orderDiscountPercent: '100' }, '100.00'),
    ).not.toThrow();
  });
});
