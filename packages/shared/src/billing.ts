import Decimal from 'decimal.js';
import { MONEY_DECIMAL_PLACES } from './constants';
import type { MoneyBreakdown } from './types';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface BillingLineInput {
  quantity: string | number | Decimal;
  unitPrice: string | number | Decimal;
  discountAmount?: string | number | Decimal;
  discountPercent?: string | number | Decimal;
  cgstRate?: string | number | Decimal;
  sgstRate?: string | number | Decimal;
  igstRate?: string | number | Decimal;
}

export interface BillingCalcInput {
  items: BillingLineInput[];
  orderDiscountAmount?: string | number | Decimal;
  orderDiscountPercent?: string | number | Decimal;
  useIgst?: boolean;
  roundingMode?: 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
}

function d(value: string | number | Decimal | undefined | null): Decimal {
  if (value === undefined || value === null || value === '') {
    return new Decimal(0);
  }
  return new Decimal(value);
}

function money(value: Decimal): string {
  return value.toFixed(MONEY_DECIMAL_PLACES);
}

/**
 * Convert a combined GST rate into the rate fields expected by the billing
 * engine: IGST when interstate, otherwise a CGST/SGST split. Computed with
 * Decimal so the split rate itself never suffers binary floating-point drift.
 */
export function gstRateSplit(
  taxRate: string | number | Decimal,
  useIgst: boolean,
): { cgstRate?: string; sgstRate?: string; igstRate?: string } {
  const rate = d(taxRate);
  if (useIgst) return { igstRate: rate.toString() };
  const half = rate.div(2).toFixed(4);
  return { cgstRate: half, sgstRate: half };
}

function applyDiscount(
  amount: Decimal,
  discountAmount?: string | number | Decimal,
  discountPercent?: string | number | Decimal,
): { discounted: Decimal; discount: Decimal } {
  const percent = d(discountPercent);
  const absolute = d(discountAmount);
  const fromPercent = amount.mul(percent).div(100);
  const discount = Decimal.max(absolute, fromPercent);
  const capped = Decimal.min(discount, amount);
  return { discounted: amount.minus(capped), discount: capped };
}

function applyRounding(amount: Decimal, mode: BillingCalcInput['roundingMode']): Decimal {
  switch (mode) {
    case 'NEAREST':
      return amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    case 'UP':
      return amount.toDecimalPlaces(0, Decimal.ROUND_CEIL);
    case 'DOWN':
      return amount.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    case 'NONE':
    default:
      return amount.toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP);
  }
}

/**
 * Centralized billing engine — the single source of truth for money math.
 * Never duplicate these calculations in UI components.
 */
export function calculateBilling(input: BillingCalcInput): MoneyBreakdown {
  let grossAmount = new Decimal(0);
  let itemDiscount = new Decimal(0);
  let taxableBeforeOrderDiscount = new Decimal(0);
  let weightedCgst = new Decimal(0);
  let weightedSgst = new Decimal(0);
  let weightedIgst = new Decimal(0);

  for (const item of input.items) {
    const lineGross = d(item.quantity).mul(d(item.unitPrice));
    const { discounted, discount } = applyDiscount(
      lineGross,
      item.discountAmount,
      item.discountPercent,
    );

    grossAmount = grossAmount.plus(lineGross);
    itemDiscount = itemDiscount.plus(discount);
    taxableBeforeOrderDiscount = taxableBeforeOrderDiscount.plus(discounted);

    if (input.useIgst) {
      weightedIgst = weightedIgst.plus(discounted.mul(d(item.igstRate)).div(100));
    } else {
      weightedCgst = weightedCgst.plus(discounted.mul(d(item.cgstRate)).div(100));
      weightedSgst = weightedSgst.plus(discounted.mul(d(item.sgstRate)).div(100));
    }
  }

  const { discounted: taxableAmount, discount: orderDiscount } = applyDiscount(
    taxableBeforeOrderDiscount,
    input.orderDiscountAmount,
    input.orderDiscountPercent,
  );

  const discountRatio =
    taxableBeforeOrderDiscount.isZero()
      ? new Decimal(0)
      : taxableAmount.div(taxableBeforeOrderDiscount);

  const cgst = weightedCgst.mul(discountRatio).toDecimalPlaces(MONEY_DECIMAL_PLACES);
  const sgst = weightedSgst.mul(discountRatio).toDecimalPlaces(MONEY_DECIMAL_PLACES);
  const igst = weightedIgst.mul(discountRatio).toDecimalPlaces(MONEY_DECIMAL_PLACES);
  const totalTax = cgst.plus(sgst).plus(igst);
  const subtotal = taxableAmount;
  const beforeRounding = taxableAmount.plus(totalTax);
  const grandTotal = applyRounding(beforeRounding, input.roundingMode ?? 'NONE');
  const rounding = grandTotal.minus(beforeRounding);

  return {
    grossAmount: money(grossAmount),
    itemDiscount: money(itemDiscount.plus(orderDiscount)),
    subtotal: money(subtotal),
    taxableAmount: money(taxableAmount),
    cgst: money(cgst),
    sgst: money(sgst),
    igst: money(igst),
    totalTax: money(totalTax),
    rounding: money(rounding),
    grandTotal: money(grandTotal),
  };
}
