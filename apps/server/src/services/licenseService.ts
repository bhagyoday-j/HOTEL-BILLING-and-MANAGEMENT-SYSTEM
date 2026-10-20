import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  LICENSE_TERM_MONTHS,
  addMonths,
  daysUntil,
  formatLicenseCode,
  normalizeLicenseKey,
  type LicenseState,
  type LicenseStatus,
} from '@hotel-billing/shared';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

/**
 * Offline software subscription.
 *
 * The application must run without any network connection, so licence
 * validation happens locally: the vendor issues an activation key, the app
 * checks it against this PC and stores the resulting term in SQLite.
 *
 * Security model (and its honest limits):
 * - The activation key is a vendor secret. Only its HMAC is stored, never the
 *   key text, and it is bound to this computer's fingerprint so copying the
 *   application data folder to another PC does not transfer the subscription.
 * - The stored term is signed with an HMAC over machine id + dates, so editing
 *   `expiresAt` in the SQLite file invalidates the signature and the app asks
 *   for activation again.
 * - Because the check runs on the customer's own machine, a determined attacker
 *   who reverse-engineers the bundle could recompute the signature. Fully
 *   tamper-proof licensing requires a hardware dongle or an online server.
 */

/** Vendor activation password. Give this to the customer, never log it. */
export const ACTIVATION_KEY = 'abcd311';

/**
 * Per-machine keys are derived from the master key, so the same password can
 * also be issued as a unique key for one PC (`npm run license:key`). Rotating
 * the master key invalidates every issued key and every stored signature.
 */
const SIGNING_PEPPER = 'hotel-billing.license.v1';

/** Single-row table: one installation holds one subscription. */
const LICENSE_ROW_ID = 'current';

const CODE_LENGTH = 16;

let cachedMachineId: string | null = null;

function hmac(secret: string, value: string): string {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

/** Constant-time string comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Stable fingerprint of this computer. Windows' MachineGuid survives reboots and
 * updates; the fallback uses hostname + platform + first MAC address.
 */
export function resolveMachineId(): string {
  if (cachedMachineId) return cachedMachineId;

  const override = process.env.LICENSE_MACHINE_ID;
  if (override) {
    cachedMachineId = override;
    return cachedMachineId;
  }

  if (process.platform === 'win32') {
    try {
      const output = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
        { encoding: 'utf8', windowsHide: true, timeout: 5_000 },
      );
      const match = output.match(/MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]+)/);
      if (match?.[1]) {
        cachedMachineId = `win:${match[1].toLowerCase()}`;
        return cachedMachineId;
      }
    } catch {
      // Registry unavailable (locked-down machine) — fall back to hardware hints.
    }
  }

  const mac =
    Object.values(os.networkInterfaces())
      .flat()
      .find((entry) => entry && !entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00')
      ?.mac ?? 'no-mac';
  cachedMachineId = `${os.platform()}:${os.hostname()}:${os.arch()}:${mac}`;
  return cachedMachineId;
}

/** Short code shown on the activation screen and sent to the vendor. */
export function machineCodeFor(machineId: string): string {
  return formatLicenseCode(hmac(SIGNING_PEPPER, `machine:${machineId}`).slice(0, CODE_LENGTH));
}

/** Per-machine activation key issued for one machine code. */
export function derivedActivationKey(machineCode: string): string {
  const code = normalizeLicenseKey(machineCode);
  return hmac(`${SIGNING_PEPPER}:${ACTIVATION_KEY}`, `activation:${code}`).slice(0, CODE_LENGTH);
}

/** Hash stored instead of the key text. Scoped to the machine, so it cannot be reused elsewhere. */
export function hashActivationKey(machineId: string, key: string): string {
  return hmac(SIGNING_PEPPER, `activation-hash:${machineId}:${normalizeLicenseKey(key)}`);
}

/**
 * A key is accepted when it is the vendor password or the per-machine key
 * derived for this computer.
 */
export function isValidActivationKey(machineId: string, key: string): boolean {
  const entered = normalizeLicenseKey(key);
  if (!entered) return false;
  const master = normalizeLicenseKey(ACTIVATION_KEY);
  const perMachine = derivedActivationKey(machineCodeFor(machineId));
  return safeEqual(entered, master) || safeEqual(entered, perMachine);
}

export interface LicenseRecordLike {
  machineId: string;
  activationHash: string;
  activatedAt: Date;
  expiresAt: Date;
  termIndex: number;
  signature: string;
}

function signaturePayload(record: {
  machineId: string;
  activatedAt: Date;
  expiresAt: Date;
  termIndex: number;
}): string {
  return [
    record.machineId,
    new Date(record.activatedAt).toISOString(),
    new Date(record.expiresAt).toISOString(),
    String(record.termIndex),
  ].join('|');
}

/** HMAC over the stored term so the SQLite file cannot be edited to extend it. */
export function signLicenseRecord(record: {
  machineId: string;
  activatedAt: Date;
  expiresAt: Date;
  termIndex: number;
}): string {
  return hmac(SIGNING_PEPPER, `record:${signaturePayload(record)}`);
}

export function verifyLicenseRecord(record: LicenseRecordLike): boolean {
  return safeEqual(record.signature, signLicenseRecord(record));
}

/**
 * Pure state evaluation: no database, no clock, easy to unit test.
 * A record is only valid on the machine it was activated on and while its
 * signature still matches.
 */
export function evaluateLicenseState(
  record: LicenseRecordLike | null,
  machineId: string,
  now: Date,
): LicenseState {
  if (!record) return 'UNLICENSED';
  if (record.machineId !== machineId) return 'UNLICENSED';
  if (!verifyLicenseRecord(record)) return 'UNLICENSED';
  return now.getTime() < new Date(record.expiresAt).getTime() ? 'ACTIVE' : 'EXPIRED';
}

/** Renewals extend from the later of today and the current expiry. */
export function nextExpiry(expiresAt: Date | null, now: Date, months = LICENSE_TERM_MONTHS): Date {
  const base =
    expiresAt && new Date(expiresAt).getTime() > now.getTime() ? new Date(expiresAt) : new Date(now);
  return addMonths(base, months);
}

function buildStatus(
  record: LicenseRecordLike | null,
  machineId: string,
  now: Date,
  hotelConfigured: boolean,
): LicenseStatus {
  const state = evaluateLicenseState(record, machineId, now);
  const active = state !== 'UNLICENSED';
  return {
    state,
    machineCode: machineCodeFor(machineId),
    activatedAt: active && record ? new Date(record.activatedAt).toISOString() : null,
    expiresAt: active && record ? new Date(record.expiresAt).toISOString() : null,
    daysRemaining: active && record ? daysUntil(new Date(record.expiresAt), now) : 0,
    termIndex: active && record ? record.termIndex : 0,
    hotelConfigured,
  };
}

async function ownerExists(): Promise<boolean> {
  const owner = await getPrisma().user.findFirst({
    where: { deletedAt: null, role: { code: 'ADMIN' } },
    select: { id: true },
  });
  return Boolean(owner);
}

async function readRecord(): Promise<LicenseRecordLike | null> {
  return getPrisma().softwareLicense.findUnique({ where: { id: LICENSE_ROW_ID } });
}

export class LicenseService {
  private audit = new AuditService();

  async status(): Promise<LicenseStatus> {
    const [record, hasOwner] = await Promise.all([readRecord(), ownerExists()]);
    return buildStatus(record, resolveMachineId(), new Date(), hasOwner);
  }

  /**
   * First activation on this PC. Re-activation after expiry (or after copying
   * the data folder here) starts a fresh one-year term bound to this machine.
   */
  async activate(key: string, userId?: string): Promise<LicenseStatus> {
    const prisma = getPrisma();
    const machineId = resolveMachineId();
    const now = new Date();

    if (!(await ownerExists())) {
      throw new AppError(
        'SETUP_REQUIRED',
        'Finish the first-run setup before activating the software',
        409,
      );
    }
    if (!isValidActivationKey(machineId, key)) {
      throw new AppError(
        'INVALID_ACTIVATION_KEY',
        'That activation key is not valid for this computer',
        400,
      );
    }

    const existing = await readRecord();
    if (existing && evaluateLicenseState(existing, machineId, now) === 'ACTIVE') {
      throw new AppError(
        'ALREADY_ACTIVATED',
        'This installation is already activated. Use a renewal key to extend it',
        409,
      );
    }

    const activatedAt = now;
    const expiresAt = addMonths(now, LICENSE_TERM_MONTHS);
    const record = { machineId, activatedAt, expiresAt, termIndex: 1 };
    const data = {
      ...record,
      activationHash: hashActivationKey(machineId, key),
      signature: signLicenseRecord(record),
    };

    await prisma.softwareLicense.upsert({
      where: { id: LICENSE_ROW_ID },
      update: data,
      create: { id: LICENSE_ROW_ID, ...data },
    });

    await this.audit.log({
      userId,
      action: 'LICENSE_ACTIVATE',
      entityType: 'SoftwareLicense',
      entityId: LICENSE_ROW_ID,
      entityRef: machineCodeFor(machineId),
      details: { expiresAt: expiresAt.toISOString(), termIndex: 1 },
    });

    return this.status();
  }

  /** Renewal keeps the original activation date and adds another year. */
  async renew(key: string, userId?: string): Promise<LicenseStatus> {
    const prisma = getPrisma();
    const machineId = resolveMachineId();
    const now = new Date();

    const existing = await readRecord();
    if (!existing || evaluateLicenseState(existing, machineId, now) === 'UNLICENSED') {
      throw new AppError(
        'NOT_ACTIVATED',
        'Activate this installation on this computer before renewing it',
        409,
      );
    }
    if (!isValidActivationKey(machineId, key)) {
      throw new AppError(
        'INVALID_RENEWAL_KEY',
        'That renewal key is not valid for this computer',
        400,
      );
    }

    const expiresAt = nextExpiry(existing.expiresAt, now);
    const record = {
      machineId,
      activatedAt: new Date(existing.activatedAt),
      expiresAt,
      termIndex: existing.termIndex + 1,
    };
    await prisma.softwareLicense.update({
      where: { id: LICENSE_ROW_ID },
      data: {
        ...record,
        activationHash: hashActivationKey(machineId, key),
        signature: signLicenseRecord(record),
      },
    });

    await this.audit.log({
      userId,
      action: 'LICENSE_RENEW',
      entityType: 'SoftwareLicense',
      entityId: LICENSE_ROW_ID,
      entityRef: machineCodeFor(machineId),
      details: { expiresAt: expiresAt.toISOString(), termIndex: record.termIndex },
    });

    return this.status();
  }

  /** Used by the API gate: throws when the subscription is not active. */
  async assertActive(): Promise<LicenseStatus> {
    const status = await this.status();
    if (status.state === 'EXPIRED') {
      throw new AppError(
        'SUBSCRIPTION_EXPIRED',
        'The software subscription has expired. Enter a renewal key to continue.',
        402,
      );
    }
    if (status.state !== 'ACTIVE') {
      throw new AppError(
        'SUBSCRIPTION_REQUIRED',
        'This installation is not activated. Enter an activation key to continue.',
        402,
      );
    }
    return status;
  }
}
