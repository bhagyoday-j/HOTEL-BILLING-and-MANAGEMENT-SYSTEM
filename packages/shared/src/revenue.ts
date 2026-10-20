/**
 * Bill statuses that never count towards revenue. Cancelled, draft and refunded
 * bills are kept for history, but every revenue figure (dashboard, analytics,
 * customer spend) must exclude them. Revenue is derived from the bills that are
 * *not* excluded, so cancelling a bill removes its amount from every total
 * exactly once and repeating the cancellation cannot deduct it twice.
 */
export const REVENUE_EXCLUDED_STATUSES = ['CANCELLED', 'DRAFT', 'REFUNDED'] as const;

export type RevenueExcludedStatus = (typeof REVENUE_EXCLUDED_STATUSES)[number];

/** True when a bill in this status contributes to revenue. */
export function isRevenueBill(status: string | null | undefined): boolean {
  if (!status) return false;
  return !(REVENUE_EXCLUDED_STATUSES as readonly string[]).includes(status);
}
