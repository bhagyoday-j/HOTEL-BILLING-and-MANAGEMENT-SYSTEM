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
  async log(input: AuditInput): Promise<void> {
    const prisma = getPrisma();
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
