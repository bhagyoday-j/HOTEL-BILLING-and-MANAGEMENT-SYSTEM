import { getPrisma } from '../utils/prisma';

export class BackupRecordService {
  async list(page = 1) {
    const prisma = getPrisma();
    const pageSize = 25;
    const [total, items] = await Promise.all([
      prisma.backupRecord.count(),
      prisma.backupRecord.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  async record(input: {
    fileName: string;
    filePath: string;
    fileSize?: number;
    triggerType: string;
    status?: string;
    errorMessage?: string;
  }) {
    const prisma = getPrisma();
    return prisma.backupRecord.create({ data: input });
  }
}
