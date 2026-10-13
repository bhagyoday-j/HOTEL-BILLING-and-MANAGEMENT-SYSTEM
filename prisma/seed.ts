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
  pin?: string;
  fullName: string;
  role: RoleCode;
}> = [
  { username: 'admin', password: 'Admin@123', fullName: 'System Administrator', role: 'ADMIN' },
  { username: 'manager', password: 'Manager@123', fullName: 'Hotel Manager', role: 'MANAGER' },
  {
    username: 'reception',
    password: 'Reception@123',
    fullName: 'Front Desk Receptionist',
    role: 'RECEPTIONIST',
  },
  {
    username: 'cashier',
    password: 'Cashier@123',
    pin: '1234',
    fullName: 'Front Desk Cashier',
    role: 'CASHIER',
  },
  {
    username: 'restaurant',
    password: 'Restaurant@123',
    fullName: 'Restaurant Staff',
    role: 'RESTAURANT_STAFF',
  },
  { username: 'viewer', password: 'Viewer@123', fullName: 'Read-Only Viewer', role: 'VIEWER' },
];

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
    const pinHash = u.pin ? await argon2.hash(u.pin) : null;

    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        passwordHash,
        pinHash,
        fullName: u.fullName,
        roleId: role.id,
        isActive: true,
      },
      create: {
        username: u.username,
        passwordHash,
        pinHash,
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
          { key: 'orderPrefix', value: 'ORD' },
          { key: 'kotPrefix', value: 'KOT' },
          { key: 'paymentPrefix', value: 'PAY' },
          { key: 'bookingPrefix', value: 'BKG' },
          { key: 'receiptFooter', value: 'Thank you for staying with us!' },
          {
            key: 'termsAndConditions',
            value: 'All disputes subject to Pune jurisdiction. Check-out time 12:00 PM.',
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

async function seedRoomTypesAndRooms() {
  const types = [
    {
      name: 'Single',
      description: 'Comfortable single occupancy room',
      basePrice: '2500',
      maxGuests: 1,
      amenities: JSON.stringify(['WiFi', 'TV', 'AC']),
    },
    {
      name: 'Double',
      description: 'Spacious double occupancy room',
      basePrice: '3500',
      maxGuests: 2,
      amenities: JSON.stringify(['WiFi', 'TV', 'AC', 'Mini Bar']),
    },
    {
      name: 'Deluxe',
      description: 'Premium deluxe room with city view',
      basePrice: '5500',
      maxGuests: 3,
      amenities: JSON.stringify(['WiFi', 'TV', 'AC', 'Mini Bar', 'Bathtub']),
    },
    {
      name: 'Suite',
      description: 'Luxury suite with living area',
      basePrice: '9000',
      maxGuests: 4,
      amenities: JSON.stringify(['WiFi', 'TV', 'AC', 'Mini Bar', 'Bathtub', 'Living Room']),
    },
  ];

  const typeMap: Record<string, string> = {};
  for (const t of types) {
    const record = await prisma.roomType.upsert({
      where: { name: t.name },
      update: t,
      create: t,
    });
    typeMap[t.name] = record.id;
  }

  const rooms: Array<{ number: string; floor: number; type: string }> = [
    { number: '101', floor: 1, type: 'Single' },
    { number: '102', floor: 1, type: 'Single' },
    { number: '103', floor: 1, type: 'Double' },
    { number: '104', floor: 1, type: 'Double' },
    { number: '201', floor: 2, type: 'Deluxe' },
    { number: '202', floor: 2, type: 'Deluxe' },
    { number: '203', floor: 2, type: 'Suite' },
    { number: '204', floor: 2, type: 'Suite' },
  ];

  for (const r of rooms) {
    await prisma.room.upsert({
      where: { number: r.number },
      update: {
        floor: r.floor,
        roomTypeId: typeMap[r.type],
        status: 'AVAILABLE',
      },
      create: {
        number: r.number,
        floor: r.floor,
        roomTypeId: typeMap[r.type],
        status: 'AVAILABLE',
      },
    });
  }
}

async function seedRestaurant() {
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
      kitchenName: 'Masala Dosa',
    },
    {
      name: 'Idli Sambar',
      sku: 'BF-002',
      category: 'Breakfast',
      price: '80',
      taxRate: '5',
      kitchenName: 'Idli',
    },
    {
      name: 'Veg Thali',
      sku: 'LN-001',
      category: 'Lunch',
      price: '250',
      taxRate: '5',
      kitchenName: 'Veg Thali',
    },
    {
      name: 'Paneer Butter Masala',
      sku: 'DN-001',
      category: 'Dinner',
      price: '280',
      taxRate: '5',
      kitchenName: 'PBM',
    },
    {
      name: 'Butter Naan',
      sku: 'DN-002',
      category: 'Dinner',
      price: '60',
      taxRate: '5',
      kitchenName: 'Butter Naan',
    },
    {
      name: 'Veg Burger',
      sku: 'SN-001',
      category: 'Snacks',
      price: '150',
      taxRate: '5',
      kitchenName: 'Veg Burger',
    },
    {
      name: 'Tea',
      sku: 'BV-001',
      category: 'Beverages',
      price: '30',
      taxRate: '5',
      kitchenName: 'Tea',
    },
    {
      name: 'Filter Coffee',
      sku: 'BV-002',
      category: 'Beverages',
      price: '40',
      taxRate: '5',
      kitchenName: 'Coffee',
    },
    {
      name: 'Gulab Jamun',
      sku: 'DS-001',
      category: 'Desserts',
      price: '90',
      taxRate: '5',
      kitchenName: 'Gulab Jamun',
    },
  ];

  for (const item of items) {
    await prisma.menuItem.upsert({
      where: { sku: item.sku },
      update: {
        name: item.name,
        price: item.price,
        taxRate: item.taxRate,
        kitchenName: item.kitchenName,
        categoryId: catMap[item.category],
        isAvailable: true,
      },
      create: {
        name: item.name,
        sku: item.sku,
        price: item.price,
        taxRate: item.taxRate,
        kitchenName: item.kitchenName,
        categoryId: catMap[item.category],
        isAvailable: true,
      },
    });
  }

  const tables = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
  for (const name of tables) {
    await prisma.restaurantTable.upsert({
      where: { name },
      update: { status: 'AVAILABLE' },
      create: { name, capacity: 4, status: 'AVAILABLE' },
    });
  }
}

async function seedExpenseCategories() {
  const cats = [
    'Electricity',
    'Maintenance',
    'Food supplies',
    'Cleaning',
    'Salary',
    'Transport',
    'Other',
  ];
  for (const name of cats) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    });
  }
}

async function seedSequences() {
  const year = new Date().getFullYear();
  const sequences = [
    { key: 'INV', prefix: 'INV', year },
    { key: 'ORD', prefix: 'ORD', year },
    { key: 'KOT', prefix: 'KOT', year },
    { key: 'PAY', prefix: 'PAY', year },
    { key: 'BKG', prefix: 'BKG', year },
  ];

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

async function seedPrinterSettings() {
  const printers = [
    { purpose: 'INVOICE', paperFormat: 'A4' },
    { purpose: 'RECEIPT', paperFormat: 'THERMAL_80' },
    { purpose: 'KOT', paperFormat: 'THERMAL_80' },
  ];

  for (const p of printers) {
    await prisma.printerSetting.upsert({
      where: { purpose: p.purpose },
      update: {},
      create: {
        purpose: p.purpose,
        paperFormat: p.paperFormat,
        silentPrint: false,
        copies: 1,
      },
    });
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('Seeding database...');

  await seedRolesAndPermissions();
  await seedUsers();
  await seedHotel();
  await seedTaxes();
  await seedRoomTypesAndRooms();
  await seedRestaurant();
  await seedExpenseCategories();
  await seedSequences();
  await seedPrinterSettings();

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log('Dev credentials (CHANGE BEFORE PRODUCTION):');
  for (const u of DEV_USERS) {
    // eslint-disable-next-line no-console
    console.log(`  ${u.username} / ${u.password}${u.pin ? ` (PIN: ${u.pin})` : ''} [${u.role}]`);
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
