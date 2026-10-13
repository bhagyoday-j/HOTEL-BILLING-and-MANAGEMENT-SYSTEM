import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

function num(value: unknown): number {
  return Number(value?.toString() ?? '0');
}

export class CashSessionService {
  private audit = new AuditService();

  /** Currently open session for a user (or the most recent one). */
  async current(userId: string) {
    const prisma = getPrisma();
    return prisma.cashSession.findFirst({
      where: { userId },
      orderBy: { openedAt: 'desc' },
    });
  }

  async open(userId: string, openingCash: string, notes?: string) {
    const prisma = getPrisma();
    const existing = await prisma.cashSession.findFirst({
      where: { userId, status: 'OPEN' },
    });
    if (existing) {
      throw new AppError('SESSION_ALREADY_OPEN', 'You already have an open cash session', 409);
    }

    const session = await prisma.cashSession.create({
      data: { userId, openingCash, notes, status: 'OPEN' },
    });

    await this.audit.log({
      userId,
      action: 'CASH_SESSION_OPEN',
      entityType: 'CashSession',
      entityId: session.id,
      details: { openingCash },
    });
    return session;
  }

  /** Live expected cash for the shift: opening + cash sales − cash expenses. */
  async summary(sessionId: string) {
    const prisma = getPrisma();
    const session = await prisma.cashSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        payments: { where: { deletedAt: null } },
        expenses: { where: { deletedAt: null } },
      },
    });

    const cashSales = session.payments
      .filter((p) => p.method === 'CASH')
      .reduce((s, p) => s + num(p.amount) - num(p.changeAmount), 0);
    const cashExpenses = session.expenses
      .filter((e) => e.paymentMethod === 'CASH')
      .reduce((s, e) => s + num(e.amount), 0);

    const expected = num(session.openingCash) + cashSales - cashExpenses;

    return {
      session,
      cashSales: cashSales.toFixed(2),
      cashExpenses: cashExpenses.toFixed(2),
      expectedCash: expected.toFixed(2),
    };
  }

  async close(
    sessionId: string,
    userId: string,
    input: { actualCash: string; notes?: string },
  ) {
    const prisma = getPrisma();
    const session = await prisma.cashSession.findFirst({
      where: { id: sessionId, status: 'OPEN' },
    });
    if (!session) throw new AppError('SESSION_NOT_OPEN', 'No open cash session found', 404);

    const { expectedCash } = await this.summary(sessionId);
    const difference = Number(input.actualCash) - Number(expectedCash);

    const updated = await prisma.$transaction(async (tx) => {
      const closed = await tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          expectedCash,
          actualCash: input.actualCash,
          difference: difference.toFixed(2),
          notes: input.notes ?? session.notes,
        },
      });

      // DailyClosing snapshot (one per calendar day)
      const closingDate = new Date();
      closingDate.setHours(0, 0, 0, 0);
      await tx.dailyClosing.upsert({
        where: { closingDate },
        update: { cashSessionId: sessionId },
        create: {
          closingDate,
          cashSessionId: sessionId,
          notes: input.notes,
        },
      });

      return closed;
    });

    await this.audit.log({
      userId,
      action: 'CASH_SESSION_CLOSE',
      entityType: 'CashSession',
      entityId: sessionId,
      details: {
        expectedCash,
        actualCash: input.actualCash,
        difference: difference.toFixed(2),
      },
    });
    return updated;
  }

  async list(opts: { page?: number; userId?: string }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = 25;
    const where: Record<string, unknown> = {};
    if (opts.userId) where.userId = opts.userId;

    const [total, items] = await Promise.all([
      prisma.cashSession.count({ where }),
      prisma.cashSession.findMany({
        where,
        include: { user: { select: { fullName: true, username: true } } },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }
}
