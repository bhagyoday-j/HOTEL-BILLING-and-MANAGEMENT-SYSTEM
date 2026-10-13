import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

export class ExpenseService {
  private audit = new AuditService();

  async listCategories() {
    const prisma = getPrisma();
    return prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async list(opts: { from?: string; to?: string; categoryId?: string; page?: number }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = 25;

    const where: Record<string, unknown> = { deletedAt: null };
    if (opts.from || opts.to) {
      where.expenseDate = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }
    if (opts.categoryId) where.categoryId = opts.categoryId;

    const [total, items] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        include: { category: true, user: { select: { fullName: true } } },
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async create(
    input: {
      categoryId: string;
      amount: string;
      description?: string;
      paymentMethod?: string;
      expenseDate?: string;
    },
    userId: string,
  ) {
    const prisma = getPrisma();
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, isActive: true },
    });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Expense category not found', 404);

    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Amount must be positive', 400);
    }

    // Attach to the user's open cash session when paid in cash
    let cashSessionId: string | null = null;
    if ((input.paymentMethod ?? 'CASH') === 'CASH') {
      const session = await prisma.cashSession.findFirst({
        where: { userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      });
      cashSessionId = session?.id ?? null;
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: input.categoryId,
        amount: input.amount,
        description: input.description,
        paymentMethod: input.paymentMethod ?? 'CASH',
        expenseDate: input.expenseDate ? new Date(input.expenseDate) : new Date(),
        userId,
        cashSessionId,
      },
      include: { category: true, user: { select: { fullName: true } } },
    });

    await this.audit.log({
      userId,
      action: 'EXPENSE_CREATE',
      entityType: 'Expense',
      entityId: expense.id,
      details: { amount: input.amount, category: category.name },
    });
    return expense;
  }
}
