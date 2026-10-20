import { describe, expect, it } from 'vitest';
import { addMonths, daysUntil, formatLicenseCode, normalizeLicenseKey } from '@hotel-billing/shared';
import {
  ACTIVATION_KEY,
  derivedActivationKey,
  evaluateLicenseState,
  isValidActivationKey,
  machineCodeFor,
  nextExpiry,
  signLicenseRecord,
  verifyLicenseRecord,
} from './licenseService';

const MACHINE_A = 'win:11111111-1111-1111-1111-111111111111';
const MACHINE_B = 'win:22222222-2222-2222-2222-222222222222';
const NOW = new Date('2026-10-20T00:00:00.000Z');

function record(overrides: Partial<Parameters<typeof signLicenseRecord>[0]> = {}) {
  const base = {
    machineId: MACHINE_A,
    activatedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    termIndex: 1,
    ...overrides,
  };
  return { ...base, activationHash: 'hash', signature: signLicenseRecord(base) };
}

describe('license helpers', () => {
  it('formats and normalizes codes so typing style does not matter', () => {
    expect(formatLicenseCode('abcdefghijklmnop')).toBe('ABCD-EFGH-IJKL-MNOP');
    expect(normalizeLicenseKey('ABCD-EFGH-IJKL-MNOP')).toBe('abcdefghijklmnop');
    expect(normalizeLicenseKey(' abcd311 ')).toBe('abcd311');
  });

  it('adds a year and clamps the day', () => {
    expect(addMonths(new Date('2026-03-15T00:00:00.000Z'), 12).toISOString()).toBe(
      '2027-03-15T00:00:00.000Z',
    );
    expect(addMonths(new Date('2024-02-29T00:00:00.000Z'), 12).toISOString()).toBe(
      '2025-02-28T00:00:00.000Z',
    );
  });

  it('counts whole days remaining and never goes negative', () => {
    expect(daysUntil(new Date('2026-10-25T00:00:00.000Z'), NOW)).toBe(5);
    expect(daysUntil(new Date('2026-10-19T00:00:00.000Z'), NOW)).toBe(0);
  });
});

describe('activation keys', () => {
  it('accepts the vendor activation password', () => {
    expect(isValidActivationKey(MACHINE_A, ACTIVATION_KEY)).toBe(true);
    expect(isValidActivationKey(MACHINE_A, ' ABCD-311 ')).toBe(true);
  });

  it('rejects a wrong key', () => {
    expect(isValidActivationKey(MACHINE_A, 'abcd312')).toBe(false);
    expect(isValidActivationKey(MACHINE_A, '')).toBe(false);
  });

  it('accepts the per-machine key issued for that machine only', () => {
    const key = derivedActivationKey(machineCodeFor(MACHINE_A));
    expect(isValidActivationKey(MACHINE_A, key)).toBe(true);
    expect(isValidActivationKey(MACHINE_B, key)).toBe(false);
  });

  it('shows a different machine code per machine', () => {
    expect(machineCodeFor(MACHINE_A)).not.toBe(machineCodeFor(MACHINE_B));
    expect(machineCodeFor(MACHINE_A)).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  });
});

describe('licence record signing', () => {
  it('accepts an untouched record', () => {
    expect(verifyLicenseRecord(record())).toBe(true);
  });

  it('rejects a record whose expiry was edited', () => {
    const tampered = { ...record(), expiresAt: new Date('2035-01-01T00:00:00.000Z') };
    expect(verifyLicenseRecord(tampered)).toBe(false);
  });

  it('rejects a record copied to another machine', () => {
    const copied = { ...record(), machineId: MACHINE_B };
    expect(verifyLicenseRecord(copied)).toBe(false);
  });
});

describe('evaluateLicenseState', () => {
  it('reports UNLICENSED when nothing is stored', () => {
    expect(evaluateLicenseState(null, MACHINE_A, NOW)).toBe('UNLICENSED');
  });

  it('is ACTIVE inside the paid term', () => {
    expect(evaluateLicenseState(record(), MACHINE_A, NOW)).toBe('ACTIVE');
  });

  it('is EXPIRED after the term ends', () => {
    expect(evaluateLicenseState(record(), MACHINE_A, new Date('2027-01-01T00:00:00.000Z'))).toBe(
      'EXPIRED',
    );
  });

  it('is UNLICENSED on another computer, even with a valid term', () => {
    expect(evaluateLicenseState(record(), MACHINE_B, NOW)).toBe('UNLICENSED');
  });

  it('is UNLICENSED when the stored term was tampered with', () => {
    const forged = {
      ...record(),
      expiresAt: new Date('2036-01-01T00:00:00.000Z'),
    };
    expect(evaluateLicenseState(forged, MACHINE_A, NOW)).toBe('UNLICENSED');
  });
});

describe('nextExpiry', () => {
  it('renews an active subscription from its current expiry', () => {
    expect(nextExpiry(new Date('2027-01-01T00:00:00.000Z'), NOW).toISOString()).toBe(
      '2028-01-01T00:00:00.000Z',
    );
  });

  it('renews an expired subscription from today', () => {
    expect(nextExpiry(new Date('2026-01-01T00:00:00.000Z'), NOW).toISOString()).toBe(
      '2027-10-20T00:00:00.000Z',
    );
  });

  it('starts a full year when there is no previous term', () => {
    expect(nextExpiry(null, NOW).toISOString()).toBe('2027-10-20T00:00:00.000Z');
  });
});
