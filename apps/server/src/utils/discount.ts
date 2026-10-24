import Decimal from 'decimal.js';
import { AppError } from './errors';

/**
 * Discount entered on a bill. A discount is either an absolute amount or a
 * percentage of the taxable subtotal — never both — and is applied by the shared
 * billing engine, which re-scales tax to the discounted amount.
 */
export interface OrderDiscountInput {
  discountAmount?: string | null;
  discountPercent?: string | null;
}

export interface OrderDiscount {
  orderDiscountAmount?: string;
  orderDiscountPercent?: string;
}

const DECIMAL_PATTERN = /^\d+(\.\d{1,2})?$/;

function parseValue(raw: string | null | undefined, label: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (!DECIMAL_PATTERN.test(value)) {
    throw new AppError(
      'INVALID_DISCOUNT',
      `${label} must be a number with up to 2 decimal places`,
      400,
    );
  }
  return value;
}

/** Validate and normalize the discount fields of a create/checkout request. */
export function resolveOrderDiscount(input: OrderDiscountInput): OrderDiscount {
  const amount = parseValue(input.discountAmount, 'Discount amount');
  const percent = parseValue(input.discountPercent, 'Discount percentage');

  if (amount !== undefined && percent !== undefined) {
    throw new AppError(
      'INVALID_DISCOUNT',
      'Apply either a discount amount or a discount percentage, not both',
      400,
    );
  }

  if (percent !== undefined) {
    if (new Decimal(percent).gt(100)) {
      throw new AppError('INVALID_DISCOUNT', 'Discount percentage cannot be more than 100', 400);
    }
    return new Decimal(percent).isZero() ? {} : { orderDiscountPercent: percent };
  }

  if (amount !== undefined) {
    return new Decimal(amount).isZero() ? {} : { orderDiscountAmount: amount };
  }

  return {};
}

/** An absolute discount can never be larger than the bill's pre-discount subtotal. */
export function assertDiscountWithinSubtotal(discount: OrderDiscount, subtotal: string): void {
  if (!discount.orderDiscountAmount) return;
  if (new Decimal(discount.orderDiscountAmount).gt(subtotal)) {
    throw new AppError(
      'INVALID_DISCOUNT',
      'Discount amount cannot be more than the bill subtotal',
      400,
    );
  }
}
