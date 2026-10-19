import * as argon2 from 'argon2';
import { z } from 'zod';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type RoleCode } from '@hotel-billing/shared';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

/**
 * First-run setup. A freshly installed copy has an empty database: no roles, no hotel
 * and no accounts, so nobody could ever sign in. Until an owner (ADMIN) account exists
 * the app offers a one-time setup screen that creates those defaults together with the
 * owner's own credentials — no default password is ever shipped.
 */
export const setupSchema = z.object({
  hotelName: z.string().trim().min(1, 'Hotel name is required').max(120),
  ownerFullName: z.string().trim().min(1, 'Your name is required').max(120),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, numbers, dots, dashes allowed'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export type SetupInput = z.infer<typeof setupSchema>;

/** Defaults applied on first run; the owner can change most of them in Settings. */
const DEFAULT_HOTEL_SETTINGS: Array<[string, string]> = [
  ['currency', 'INR'],
  ['invoicePrefix', 'INV'],
  ['invoiceNumberFormat', '{PREFIX}-{YEAR}-{SEQ}'],
  ['receiptFooter', 'Thank you for visiting us!'],
  ['termsAndConditions', ''],
  ['cgstRate', '9'],
  ['sgstRate', '9'],
  ['igstRate', '18'],
  ['useIgst', 'false'],
  ['roundingMode', 'NONE'],
  ['backupFrequency', 'DAILY'],
  ['backupKeepCount', '30'],
  ['theme', 'light'],
];

const DEFAULT_TAXES = [
  { code: 'CGST', name: 'Central GST', rate: '9' },
  { code: 'SGST', name: 'State GST', rate: '9' },
  { code: 'IGST', name: 'Integrated GST', rate: '18' },
];

export class SetupService {
  private audit = new AuditService();

  /** Setup is required while the installation has no active owner account. */
  async status(): Promise<{ required: boolean }> {
    const prisma = getPrisma();
    const owner = await prisma.user.findFirst({
      where: { deletedAt: null, role: { code: 'ADMIN' } },
      select: { id: true },
    });
    return { required: !owner };
  }

  async complete(input: SetupInput): Promise<{ username: string; userId: string }> {
    const prisma = getPrisma();

    const existing = await prisma.user.findFirst({
      where: { deletedAt: null, role: { code: 'ADMIN' } },
      select: { id: true },
    });
    if (existing) {
      throw new AppError('SETUP_ALREADY_COMPLETE', 'This installation is already set up', 409);
    }

    const passwordHash = await argon2.hash(input.password);

    const created = await prisma.$transaction(async (tx) => {
      const permissionIds = new Map<string, string>();
      for (const code of PERMISSIONS) {
        const permission = await tx.permission.upsert({
          where: { code },
          update: {},
          create: { code, name: code.replace(/_/g, ' '), description: `Permission: ${code}` },
        });
        permissionIds.set(code, permission.id);
      }

      const roleIds = new Map<RoleCode, string>();
      for (const roleCode of ROLES) {
        const role = await tx.role.upsert({
          where: { code: roleCode },
          update: {},
          create: {
            code: roleCode,
            name: roleCode.replace(/_/g, ' '),
            description: `${roleCode} role`,
          },
        });
        roleIds.set(roleCode, role.id);

        for (const permissionCode of ROLE_PERMISSIONS[roleCode]) {
          const permissionId = permissionIds.get(permissionCode);
          if (!permissionId) continue;
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId } },
            update: {},
            create: { roleId: role.id, permissionId },
          });
        }
      }

      let hotel = await tx.hotel.findFirst({ select: { id: true } });
      if (!hotel) {
        hotel = await tx.hotel.create({ data: { name: input.hotelName }, select: { id: true } });
      }
      for (const [key, value] of DEFAULT_HOTEL_SETTINGS) {
        await tx.hotelSetting.upsert({
          where: { hotelId_key: { hotelId: hotel.id, key } },
          update: {},
          create: { hotelId: hotel.id, key, value },
        });
      }

      for (const tax of DEFAULT_TAXES) {
        await tx.tax.upsert({
          where: { code: tax.code },
          update: {},
          create: { ...tax, isActive: true },
        });
      }

      const adminRoleId = roleIds.get('ADMIN');
      if (!adminRoleId) {
        throw new AppError('SETUP_FAILED', 'ADMIN role could not be created', 500);
      }

      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.ownerFullName,
          passwordHash,
          roleId: adminRoleId,
          isActive: true,
        },
        select: { id: true, username: true },
      });

      return { userId: user.id, username: user.username };
    });

    await this.audit.log({
      userId: created.userId,
      action: 'SETUP_COMPLETE',
      entityType: 'User',
      entityId: created.userId,
      entityRef: created.username,
      details: { hotel: input.hotelName },
    });

    return created;
  }
}
