import { Router } from 'express';
import { ok } from '@hotel-billing/shared';
import asyncHandler from '../utils/asyncHandler';
import { BackupRecordService } from '../services/backupRecordService';
import { getPrisma, resolveDatabaseUrl } from '../utils/prisma';
import { requireAuth, requirePermission } from '../middleware/auth';

export const systemRouter = Router();
const backupRecordService = new BackupRecordService();

systemRouter.use(requireAuth);

systemRouter.get(
  '/backups',
  requirePermission('BACKUP_CREATE', 'BACKUP_RESTORE'),
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page ?? 1);
    res.json(ok(await backupRecordService.list(page)));
  }),
);

systemRouter.post(
  '/backups/record',
  requirePermission('BACKUP_CREATE'),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      fileName: string;
      filePath: string;
      fileSize?: number;
      triggerType: string;
      status?: string;
      errorMessage?: string;
    };
    res.status(201).json(ok(await backupRecordService.record(body)));
  }),
);

/**
 * WAL checkpoint — flushes the write-ahead log into the main DB file so the
 * Electron backup service copies a consistent snapshot.
 */
systemRouter.post(
  '/db/checkpoint',
  requirePermission('BACKUP_CREATE'),
  asyncHandler(async (_req, res) => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
    res.json(ok({ checkpointed: true }));
  }),
);

systemRouter.get(
  '/db/integrity',
  requirePermission('BACKUP_RESTORE'),
  asyncHandler(async (_req, res) => {
    const prisma = getPrisma();
    const result = await prisma.$queryRawUnsafe<Array<{ integrity_check: string }>>(
      'PRAGMA integrity_check',
    );
    res.json(
      ok({
        ok: result[0]?.integrity_check === 'ok',
        detail: result[0]?.integrity_check ?? 'unknown',
        databaseUrl: resolveDatabaseUrl(),
      }),
    );
  }),
);
