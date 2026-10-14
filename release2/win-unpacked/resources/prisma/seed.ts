import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type PermissionCode,
  type RoleCode,
} from '../packages/shared/src/permissions';

const prisma = new PrismaClient();

/** Development-only credentials — change before production use. */
const DEV_USERS: Array<{
  username: string;
  password: string;
  fullName: string;
  role: RoleCode;
}> = [
  { username: 'admin', password: 'Admin@123', fullName: 'System Administrator', role: 'ADMIN' },
  { username: 'manager', password: 'Manager@123', fullName: 'Hotel Manager', role: 'MANAGER' },
];

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

async function seedUsers() {
  for (const u of DEV_USERS) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: u.role } });
    const passwordHash = await argon2.hash(u.password);

    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        passwordHash,
        fullName: u.fullName,
        roleId: role.id,
        isActive: true,
        failedLogins: 0,
        lockedUntil: null,
      },
      create: {
        username: u.username,
        passwordHash,
        fullName: u.fullName,
        roleId: role.id,
        isActive: true,
      },
    });
  }
}

async function seedHotel() {
  const existing = await prisma.hotel.findFirst();
  if (existing) return existing;

  return prisma.hotel.create({
    data: {
      name: 'Hotel Grand Palace',
      address: '123 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      phone: '+91 20 1234 5678',
      email: 'info@hotelgrandpalace.example',
      website: 'https://hotelgrandpalace.example',
      gstin: '27AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      settings: {
        create: [
          { key: 'currency', value: 'INR' },
          { key: 'invoicePrefix', value: 'INV' },
          { key: 'invoiceNumberFormat', value: '{PREFIX}-{YEAR}-{SEQ}' },
          { key: 'receiptFooter', value: 'Thank you for visiting us!' },
          {
            key: 'termsAndConditions',
            value: 'All disputes subject to Pune jurisdiction.',
          },
          { key: 'cgstRate', value: '9' },
          { key: 'sgstRate', value: '9' },
          { key: 'igstRate', value: '18' },
          { key: 'useIgst', value: 'false' },
          { key: 'roundingMode', value: 'NONE' },
          { key: 'backupFrequency', value: 'DAILY' },
          { key: 'backupKeepCount', value: '30' },
          { key: 'theme', value: 'light' },
        ],
      },
    },
  });
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

async function seedMenu() {
  const categories = [
    { name: 'Breakfast', sortOrder: 1 },
    { name: 'Lunch', sortOrder: 2 },
    { name: 'Dinner', sortOrder: 3 },
    { name: 'Snacks', sortOrder: 4 },
    { name: 'Beverages', sortOrder: 5 },
    { name: 'Desserts', sortOrder: 6 },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const record = await prisma.menuCategory.upsert({
      where: { name: c.name },
      update: { sortOrder: c.sortOrder },
      create: c,
    });
    catMap[c.name] = record.id;
  }

  const items = [
    {
      name: 'Masala Dosa',
      sku: 'BF-001',
      category: 'Breakfast',
      price: '120',
      taxRate: '5',
    },
    {
      name: 'Idli Sambar',
      sku: 'BF-002',
      category: 'Breakfast',
      price: '80',
      taxRate: '5',
    },
    { name: 'Veg Thali', sku: 'LN-001', category: 'Lunch', price: '250', taxRate: '5' },
    {
      name: 'Paneer Butter Masala',
      sku: 'DN-001',
      category: 'Dinner',
      price: '280',
      taxRate: '5',
    },
    { name: 'Butter Naan', sku: 'DN-002', category: 'Dinner', price: '60', taxRate: '5' },
    { name: 'Veg Burger', sku: 'SN-001', category: 'Snacks', price: '150', taxRate: '5' },
    { name: 'Tea', sku: 'BV-001', category: 'Beverages', price: '30', taxRate: '5' },
    { name: 'Filter Coffee', sku: 'BV-002', category: 'Beverages', price: '40', taxRate: '5' },
    { name: 'Gulab Jamun', sku: 'DS-001', category: 'Desserts', price: '90', taxRate: '5' },
  ];

  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        price: item.price,
        taxRate: item.taxRate,
        categoryId: catMap[item.category],
        isAvailable: true,
      },
      create: {
        name: item.name,
        sku: item.sku,
        price: item.price,
        taxRate: item.taxRate,
        categoryId: catMap[item.category],
        isAvailable: true,
      },
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
  await seedUsers();
  await seedHotel();
  await seedTaxes();
  await seedMenu();
  await seedSequences();

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log('Dev credentials (CHANGE BEFORE PRODUCTION):');
  for (const u of DEV_USERS) {
    // eslint-disable-next-line no-console
    console.log(`  ${u.username} / ${u.password} [${u.role}]`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
