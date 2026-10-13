import { Router } from 'express';
import { ok, APP_NAME, APP_VERSION } from '@hotel-billing/shared';
import { getPrisma } from '../utils/prisma';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res, next) => {
  try {
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    res.json(
      ok({
        status: 'ok',
        app: APP_NAME,
        version: APP_VERSION,
        offlineCapable: true,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch (err) {
    next(err);
  }
});
