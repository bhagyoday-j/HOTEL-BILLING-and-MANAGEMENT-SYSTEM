export type DiscountMode = 'none' | 'amount' | 'percent';

export interface DiscountPayload {
  discountAmount?: string;
  discountPercent?: string;
}

/** Inline validation for the discount controls; null means valid. */
export function validateDiscount(mode: DiscountMode, value: string): string | null {
  if (mode === 'none') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return 'Enter a number with up to 2 decimal places';
  }
  if (mode === 'percent' && Number(trimmed) > 100) {
    return 'Percentage cannot be more than 100';
  }
  return null;
}

/** Request fields for the selected discount (empty when no discount applies). */
export function buildDiscount(mode: DiscountMode, value: string): DiscountPayload {
  const trimmed = value.trim();
  if (mode === 'none' || !trimmed || validateDiscount(mode, value)) return {};
  return mode === 'amount' ? { discountAmount: trimmed } : { discountPercent: trimmed };
}
