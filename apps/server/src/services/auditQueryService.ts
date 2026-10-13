import { getPrisma } from '../utils/prisma';

export class AuditQueryService {
  async list(opts: {
    action?: string;
    userId?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = 50;

    const where: Record<string, unknown> = {};
    if (opts.action) where.action = { contains: opts.action };
    if (opts.userId) where.userId = opts.userId;
    if (opts.entityType) where.entityType = opts.entityType;
    if (opts.from || opts.to) {
      where.createdAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }
}
