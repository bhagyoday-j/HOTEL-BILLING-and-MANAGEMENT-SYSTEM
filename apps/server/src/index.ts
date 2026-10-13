import { createApp } from './app';
import { LOCAL_API_HOST, LOCAL_API_PORT } from '@hotel-billing/shared';
import { logger } from './utils/logger';
import { getPrisma, disconnectPrisma } from './utils/prisma';

const port = Number(process.env.PORT ?? LOCAL_API_PORT);
const host = process.env.HOST ?? LOCAL_API_HOST;

async function start() {
  // Ensure Prisma can connect before accepting requests
  const prisma = getPrisma();
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  const server = app.listen(port, host, () => {
    logger.info({ host, port }, 'Hotel Billing local API started');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server');
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
