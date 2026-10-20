import type { Prisma } from '@prisma/client';
import { getPrisma } from '../utils/prisma';

export interface AuditInput {
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  entityRef?: string;
  details?: unknown;
}

export class AuditService {
  /**
   * Record an audit entry. Pass the surrounding transaction when the audited
   * write must commit (or roll back) together with its log entry.
   */
  async log(input: AuditInput, client?: Prisma.TransactionClient): Promise<void> {
    const prisma = client ?? getPrisma();
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityRef: input.entityRef,
        details: input.details ? JSON.stringify(input.details) : null,
      },
    });
  }
}
