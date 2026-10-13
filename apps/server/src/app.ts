import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { roomsRouter } from './routes/rooms';
import { hotelRouter } from './routes/hotel';
import { dashboardRouter } from './routes/dashboard';
import { guestsRouter } from './routes/guests';
import { bookingsRouter } from './routes/bookings';
import { restaurantRouter } from './routes/restaurant';
import { invoicesRouter } from './routes/invoices';
import { expensesRouter } from './routes/expenses';
import { cashSessionsRouter } from './routes/cashSessions';
import { reportsRouter } from './routes/reports';
import { searchRouter } from './routes/search';
import { usersRouter } from './routes/users';
import { auditRouter } from './routes/audit';
import { settingsRouter } from './routes/settings';
import { systemRouter } from './routes/system';
import { errorHandler } from './middleware/errorHandler';
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

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/rooms', roomsRouter);
  app.use('/api/hotel', hotelRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/guests', guestsRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/restaurant', restaurantRouter);
  app.use('/api/invoices', invoicesRouter);
  app.use('/api/expenses', expensesRouter);
  app.use('/api/cash-sessions', cashSessionsRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/system', systemRouter);

  app.use(errorHandler);

  return app;
}
