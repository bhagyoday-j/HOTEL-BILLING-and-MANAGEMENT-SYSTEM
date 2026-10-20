import { PrismaClient } from '@prisma/client';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type PermissionCode,
} from '../packages/shared/src/permissions';

const prisma = new PrismaClient();

/**
 * Development scaffolding only — no sample data.
 *
 * This script never creates accounts, hotels, menu items or bills. The owner
 * account and hotel profile are created by the app's first-run setup screen,
 * so a client installation always starts empty with credentials they choose.
 */

/**
 * Two-role model: every account must end up as ADMIN or MANAGER.
 * Any legacy account (reception, cashier, restaurant, viewer, …) is
 * reassigned to MANAGER so nobody is locked out. No users are deleted.
 */
async function normalizeRolesAndUsers() {
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'ADMIN' } });
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: 'MANAGER' } });

  // Reassign users holding retired roles to MANAGER (keeps accounts + data intact).
  await prisma.user.updateMany({
    where: { roleId: { notIn: [adminRole.id, managerRole.id] } },
    data: { roleId: managerRole.id },
  });

  // Retire roles that no longer exist in the application.
  await prisma.role.deleteMany({ where: { code: { notIn: [...ROLES] } } });

  // Retire permission codes that are no longer part of the permission set.
  await prisma.permission.deleteMany({ where: { code: { notIn: [...PERMISSIONS] } } });
}

async function seedRolesAndPermissions() {
  const permissionRecords: Record<string, string> = {};

  for (const code of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { code },
      update: { name: code.replace(/_/g, ' ') },
      create: {
        code,
        name: code.replace(/_/g, ' '),
        description: `Permission: ${code}`,
      },
    });
    permissionRecords[code] = perm.id;
  }

  for (const roleCode of ROLES) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      update: { name: roleCode.replace(/_/g, ' ') },
      create: {
        code: roleCode,
        name: roleCode.replace(/_/g, ' '),
        description: `${roleCode} role`,
      },
    });

    const allowed = ROLE_PERMISSIONS[roleCode] as PermissionCode[];
    const allowedSet = new Set(allowed);

    // Remove any grants that are no longer part of the role's permission set.
    const currentPermissions = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      include: { permission: true },
    });
    for (const current of currentPermissions) {
      if (!allowedSet.has(current.permission.code as PermissionCode)) {
        await prisma.rolePermission.delete({ where: { id: current.id } });
      }
    }

    for (const permCode of allowed) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permissionRecords[permCode],
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permissionRecords[permCode],
        },
      });
    }
  }
}

async function seedTaxes() {
  const taxes = [
    { code: 'CGST', name: 'Central GST', rate: '9' },
    { code: 'SGST', name: 'State GST', rate: '9' },
    { code: 'IGST', name: 'Integrated GST', rate: '18' },
  ];

  for (const t of taxes) {
    await prisma.tax.upsert({
      where: { code: t.code },
      update: { name: t.name, rate: t.rate },
      create: { code: t.code, name: t.name, rate: t.rate, isActive: true },
    });
  }
}

async function seedSequences() {
  const year = new Date().getFullYear();
  const sequences = [{ key: 'INV', prefix: 'INV', year }];

  for (const s of sequences) {
    await prisma.sequence.upsert({
      where: { key_year: { key: s.key, year: s.year } },
      update: {},
      create: {
        key: s.key,
        year: s.year,
        prefix: s.prefix,
        currentVal: 0,
        padLength: 6,
        resetYearly: true,
      },
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('Seeding database...');

  await seedRolesAndPermissions();
  await normalizeRolesAndUsers();
  await seedTaxes();
  await seedSequences();

  // eslint-disable-next-line no-console
  console.log('Seed complete — scaffolding only. No accounts or sample data are created.');
  // eslint-disable-next-line no-console
  console.log('Run the app and use the first-run setup screen to create the owner account.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
