/**
 * Update status shared by the Electron main process, the renderer and the IPC
 * bridge. Kept free of Electron imports so both sides (and unit tests) can use it.
 */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  /** Update checks are only available in the installed Windows desktop app. */
  | 'unsupported';

export interface UpdateProgress {
  /** 0–100. */
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdateStatus {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  progress?: UpdateProgress;
  /** Short, user-facing explanation (error text or state detail). */
  message?: string;
  supported: boolean;
}
