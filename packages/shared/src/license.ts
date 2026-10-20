/**
 * Subscription metadata shared by the local API and the renderer.
 *
 * The activation password itself is a vendor secret and lives only in the
 * server (`licenseService.ts`); nothing exported here can be used to guess it.
 */

/** Every activation/renewal adds a full year. */
export const LICENSE_TERM_MONTHS = 12;

/** Machine codes and per-machine activation keys are 16 characters in 4 groups. */
export const LICENSE_CODE_LENGTH = 16;

export type LicenseState = 'ACTIVE' | 'EXPIRED' | 'UNLICENSED';

export interface LicenseStatus {
  state: LicenseState;
  /** Short, human-readable fingerprint of this PC, sent to the vendor for a key. */
  machineCode: string;
  activatedAt: string | null;
  expiresAt: string | null;
  /** Whole days left; 0 once expired. */
  daysRemaining: number;
  termIndex: number;
  hotelConfigured: boolean;
}

/**
 * Add calendar months to a date, clamping to the last day of the target month
 * (31 Jan + 1 month = 28/29 Feb). Used for the one-year subscription term.
 */
export function addMonths(base: Date, months: number): Date {
  const result = new Date(base.getTime());
  const targetMonth = result.getUTCMonth() + months;
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(targetMonth);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Strip separators so `abcd-311`, `ABCD 311` and `abcd311` compare equally. */
export function normalizeLicenseKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

/** Group a code into 4-character blocks for display, e.g. `ABCD-EFGH-IJKL-MNOP`. */
export function formatLicenseCode(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join('-') ?? '';
}

/** Whole days from `now` until `until`, never negative. */
export function daysUntil(until: Date, now: Date): number {
  const ms = until.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}
