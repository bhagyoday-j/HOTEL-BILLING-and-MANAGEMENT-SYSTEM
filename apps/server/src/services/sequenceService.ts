import { Prisma } from '@prisma/client';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export type SequenceKey = 'INV' | 'ORD' | 'KOT' | 'PAY' | 'BKG';

type Tx = Prisma.TransactionClient;

/**
 * Transaction-safe sequence generation. MUST be called inside the same
 * interactive transaction that creates the document, otherwise two concurrent
 * creates could read the same value.
 */
export async function nextNumber(
  tx: Tx,
  key: SequenceKey,
  opts?: { year?: number; prefixOverride?: string },
): Promise<string> {
  const year = opts?.year ?? new Date().getFullYear();
  const prefix = opts?.prefixOverride ?? key;

  let record = await tx.sequence.findUnique({
    where: { key_year: { key, year } },
  });

  if (!record) {
    record = await tx.sequence.create({
      data: {
        key,
        year,
        prefix,
        currentVal: 0,
        padLength: 6,
        resetYearly: true,
      },
    });
  }

  const updated = await tx.sequence.update({
    where: { id: record.id },
    data: { currentVal: { increment: 1 } },
  });

  if (!updated) {
    throw new AppError('SEQUENCE_ERROR', 'Failed to allocate sequence number', 500);
  }

  return formatNumber(prefix, year, updated.currentVal, updated.padLength);
}

export function formatNumber(prefix: string, year: number, value: number, padLength = 6): string {
  const seq = String(value).padStart(padLength, '0');
  return `${prefix}-${year}-${seq}`;
}

/**
 * Convenience wrapper for use OUTSIDE interactive transactions.
 * Runs its own short transaction so numbering stays atomic.
 */
export async function nextNumberStandalone(
  key: SequenceKey,
  opts?: { year?: number; prefixOverride?: string },
): Promise<string> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => nextNumber(tx, key, opts));
}
