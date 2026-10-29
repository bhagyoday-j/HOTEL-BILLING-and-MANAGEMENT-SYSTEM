import type { UpdatePhase, UpdateStatus } from '@hotel-billing/shared';

/**
 * Events emitted by electron-updater, normalized for the status reducer.
 * No Electron imports: this module is unit-tested directly.
 */
export type UpdateEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'downloaded'; version: string }
  | { type: 'installing' }
  | { type: 'error'; message: string };

export function createUpdateStatus(currentVersion: string, supported: boolean): UpdateStatus {
  return {
    phase: supported ? 'idle' : 'unsupported',
    currentVersion,
    supported,
  };
}

function isBusy(phase: UpdatePhase): boolean {
  return phase === 'downloading' || phase === 'downloaded' || phase === 'installing';
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function nonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Pure status transition. It deliberately never moves a downloaded/installing
 * update backwards because a periodic or manual check happens to run again:
 * a ready-to-install update must stay ready until the user installs it.
 */
export function applyUpdateEvent(status: UpdateStatus, event: UpdateEvent): UpdateStatus {
  if (!status.supported) return status;

  switch (event.type) {
    case 'checking':
      if (isBusy(status.phase)) return status;
      return { ...status, phase: 'checking', message: undefined };

    case 'available':
      if (status.phase === 'downloading' || status.phase === 'downloaded' || status.phase === 'installing') {
        return status;
      }
      if (event.version === status.currentVersion) {
        return { ...status, phase: 'up-to-date', availableVersion: undefined, message: undefined };
      }
      return {
        ...status,
        phase: 'available',
        availableVersion: event.version,
        progress: undefined,
        message: undefined,
      };

    case 'not-available':
      if (isBusy(status.phase)) return status;
      return {
        ...status,
        phase: 'up-to-date',
        availableVersion: undefined,
        progress: undefined,
        message: undefined,
      };

    case 'progress':
      if (status.phase === 'downloaded' || status.phase === 'installing') return status;
      return {
        ...status,
        phase: 'downloading',
        progress: {
          percent: clampPercent(event.percent),
          transferred: nonNegative(event.transferred),
          total: nonNegative(event.total),
          bytesPerSecond: nonNegative(event.bytesPerSecond),
        },
        message: undefined,
      };

    case 'downloaded':
      return {
        ...status,
        phase: 'downloaded',
        availableVersion: event.version,
        progress: status.progress ? { ...status.progress, percent: 100 } : undefined,
        message: undefined,
      };

    case 'installing':
      return { ...status, phase: 'installing', message: undefined };

    case 'error':
      return { ...status, phase: 'error', message: event.message };

    default:
      return status;
  }
}
