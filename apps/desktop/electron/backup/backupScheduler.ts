import { logger } from '../security/logger';
import { backupService } from './backupService';

type Frequency = 'NEVER' | 'DAILY' | 'EVERY_6_HOURS' | 'EVERY_12_HOURS' | 'ON_CLOSE';

const INTERVALS: Record<string, number> = {
  DAILY: 24 * 60 * 60 * 1000,
  EVERY_6_HOURS: 6 * 60 * 60 * 1000,
  EVERY_12_HOURS: 12 * 60 * 60 * 1000,
};

let timer: NodeJS.Timeout | null = null;
let lastRun = 0;
let currentFrequency: Frequency = 'NEVER';

async function fetchFrequency(): Promise<Frequency> {
  try {
    const { apiFetch } = await import('../ipc/apiClient');
    const res = await apiFetch<{ success: boolean; data?: Record<string, string> }>('/api/settings');
    if (res.success && res.data) {
      const freq = res.data.backupFrequency as Frequency | undefined;
      if (freq && ['NEVER', 'DAILY', 'EVERY_6_HOURS', 'EVERY_12_HOURS', 'ON_CLOSE'].includes(freq)) {
        return freq;
      }
    }
  } catch {
    /* API may not be up yet */
  }
  return 'NEVER';
}

async function runBackup(): Promise<void> {
  try {
    await backupService.createBackup('SCHEDULED');
  } catch (err) {
    logger.error({ err }, 'Scheduled backup failed');
  }
}

export async function startBackupScheduler(): Promise<void> {
  const frequency = await fetchFrequency();
  currentFrequency = frequency;

  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  const interval = INTERVALS[frequency];
  if (!interval) {
    logger.info({ frequency }, 'Automatic backup disabled');
    return;
  }

  logger.info({ frequency }, 'Automatic backup scheduler started');
  timer = setInterval(async () => {
    const next = await fetchFrequency();
    if (next !== currentFrequency) {
      currentFrequency = next;
      if (!INTERVALS[next]) return; // disabled; timer will be cleared on restart
    }
    // Run at most once per interval window
    if (Date.now() - lastRun >= interval - 60_000) {
      lastRun = Date.now();
      await runBackup();
    }
  }, 60_000);
}

export function stopBackupScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Fires on app close when frequency includes ON_CLOSE. */
export async function backupOnCloseIfConfigured(): Promise<void> {
  const frequency = await fetchFrequency();
  if (frequency === 'ON_CLOSE' || INTERVALS[frequency]) {
    try {
      await backupService.createBackup('ON_CLOSE');
    } catch (err) {
      logger.error({ err }, 'On-close backup failed');
    }
  }
}
