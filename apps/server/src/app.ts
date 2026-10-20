import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { setupRouter } from './routes/setup';
import { dashboardRouter } from './routes/dashboard';
import { menuRouter } from './routes/menu';
import { tablesRouter } from './routes/tables';
import { billsRouter } from './routes/bills';
import { customersRouter } from './routes/customers';
import { analyticsRouter } from './routes/analytics';
import { usersRouter } from './routes/users';
import { hotelRouter } from './routes/hotel';
import { settingsRouter } from './routes/settings';
import { systemRouter } from './routes/system';
import { licenseRouter } from './routes/license';
import { errorHandler } from './middleware/errorHandler';
import { licenseGate } from './middleware/license';
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(requestLogger);

  // Subscription gate: blocks core API access while the licence is missing or
  // expired. Health, setup, auth and licence endpoints stay reachable so the
  // owner can sign in and activate/renew.
  app.use('/api', licenseGate);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/setup', setupRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/menu', menuRouter);
  app.use('/api/tables', tablesRouter);
  app.use('/api/bills', billsRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/hotel', hotelRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/system', systemRouter);
  app.use('/api/license', licenseRouter);

  app.use(errorHandler);

  return app;
}
