import Decimal from 'decimal.js';
import { calculateBilling, gstRateSplit, type MoneyBreakdown } from '@hotel-billing/shared';
import type { Prisma } from '@prisma/client';
import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { BillService } from './billService';
import { SettingsService } from './settingsService';
import { nextNumber } from './sequenceService';

/** A table's running bill lives on an OPEN RestaurantOrder until checkout. */
const ORDER_OPEN = 'OPEN';
const ORDER_BILLED = 'BILLED';
const ORDER_CANCELLED = 'CANCELLED';

const TABLE_AVAILABLE = 'AVAILABLE';
const TABLE_OCCUPIED = 'OCCUPIED';

export interface TableInput {
  number: string;
  capacity?: number;
  floor?: number;
}

export interface TableUpdateInput {
  number?: string;
  capacity?: number;
  floor?: number;
  isActive?: boolean;
}

export interface BulkTableInput {
  count: number;
  capacity?: number;
  floor?: number;
}

export interface BulkTableResult {
  requested: number;
  created: string[];
  skipped: string[];
  createdCount: number;
  skippedCount: number;
}

export interface AddOrderItemsInput {
  items: Array<{ menuItemId: string; quantity: string; notes?: string }>;
}

export interface CheckoutTableInput {
  clientRequestId?: string;
  customerName?: string;
  customerMobile?: string;
  notes?: string;
}

const TABLE_WITH_OPEN_ORDER = {
  orders: {
    where: { status: ORDER_OPEN, deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: {
      items: { orderBy: { createdAt: 'asc' as const } },
      createdBy: { select: { fullName: true } },
    },
  },
} satisfies Prisma.RestaurantTableInclude;

type TableWithOpenOrder = Prisma.RestaurantTableGetPayload<{
  include: typeof TABLE_WITH_OPEN_ORDER;
}>;

type OrderWithItems = Prisma.RestaurantOrderGetPayload<{
  include: { items: true; createdBy: { select: { fullName: true } } };
}>;

interface OrderLineSnapshot {
  quantity: { toString(): string } | string | number;
  unitPrice: { toString(): string } | string | number;
  taxRate: { toString(): string } | string | number;
}

/**
 * Totals for a table's open bill, always through the shared Decimal billing
 * engine. Item prices/tax rates were snapshotted when the item was added, so
 * later menu edits never change an open bill.
 */
export function computeOrderTotals(
  lines: OrderLineSnapshot[],
  useIgst: boolean,
): MoneyBreakdown {
  return calculateBilling({
    useIgst,
    items: lines.map((line) => ({
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      ...gstRateSplit(line.taxRate.toString(), useIgst),
    })),
  });
}

/** Natural sort so T2 comes before T10, and 2 before 10. */
export function compareTableNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function validateNumber(value: string): string {
  const number = value.trim();
  if (!number) throw new AppError('VALIDATION_ERROR', 'Table number is required', 400);
  if (number.length > 20) {
    throw new AppError('VALIDATION_ERROR', 'Table number must be 20 characters or fewer', 400);
  }
  return number;
}

function validateCapacity(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new AppError('VALIDATION_ERROR', 'Capacity must be a whole number between 1 and 100', 400);
  }
  return value;
}

function validateFloor(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new AppError('VALIDATION_ERROR', 'Floor must be a whole number between 0 and 100', 400);
  }
  return value;
}

function validateQuantity(value: string): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError('INVALID_QUANTITY', 'Quantity must be a positive whole number', 400);
  }
  return quantity;
}

/** Pre-tax line total, computed with Decimal to avoid float drift. */
export function lineAmount(
  quantity: string | number | Decimal,
  unitPrice: string | Decimal,
): string {
  return new Decimal(quantity.toString()).mul(unitPrice.toString()).toFixed(2);
}

/**
 * Table management plus independent bills per table.
 *
 * Each table has at most one OPEN order (its running bill). Items are appended
 * to that order only, so two tables can carry separate bills at the same time.
 * Checkout snapshots the running order into a normal Invoice and frees the
 * table; the order is kept as BILLED for history.
 */
export class TableService {
  private audit = new AuditService();
  private settings = new SettingsService();
  private bills = new BillService();

  private async useIgst(): Promise<boolean> {
    const settings = await this.settings.all();
    return settings.useIgst === 'true';
  }

  async list(opts: { search?: string; status?: string } = {}) {
    const prisma = getPrisma();
    const igst = await this.useIgst();

    const where: Prisma.RestaurantTableWhereInput = { deletedAt: null };
    if (opts.search) where.name = { contains: opts.search };
    if (opts.status === 'OCCUPIED') {
      where.orders = { some: { status: ORDER_OPEN, deletedAt: null } };
    } else if (opts.status === 'AVAILABLE') {
      where.isActive = true;
      where.orders = { none: { status: ORDER_OPEN, deletedAt: null } };
    }

    const tables = await prisma.restaurantTable.findMany({
      where,
      include: TABLE_WITH_OPEN_ORDER,
      orderBy: { name: 'asc' },
    });

    const items = tables
      .map((table) => this.serializeTable(table, igst))
      .sort((a, b) => compareTableNumbers(a.number, b.number));
    return {
      items,
      summary: {
        total: items.length,
        available: items.filter((table) => table.status === TABLE_AVAILABLE).length,
        occupied: items.filter((table) => table.status === TABLE_OCCUPIED).length,
      },
    };
  }

  async get(tableId: string) {
    const prisma = getPrisma();
    const igst = await this.useIgst();
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, deletedAt: null },
      include: TABLE_WITH_OPEN_ORDER,
    });
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);
    return this.serializeTable(table, igst);
  }

  async create(input: TableInput, userId: string) {
    const prisma = getPrisma();
    const number = validateNumber(input.number);
    const capacity = validateCapacity(input.capacity);
    const floor = validateFloor(input.floor);

    const existing = await prisma.restaurantTable.findUnique({ where: { name: number } });
    if (existing && !existing.deletedAt) {
      throw new AppError('TABLE_EXISTS', `Table ${number} already exists`, 409);
    }

    // Reuse the row of an archived table so its unique number stays available.
    const table = existing
      ? await prisma.restaurantTable.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            isActive: true,
            status: TABLE_AVAILABLE,
            capacity: capacity ?? existing.capacity,
            floor: floor ?? existing.floor,
          },
        })
      : await prisma.restaurantTable.create({
          data: {
            name: number,
            capacity: capacity ?? 4,
            floor: floor ?? 1,
            status: TABLE_AVAILABLE,
          },
        });

    await this.audit.log({
      userId,
      action: 'TABLE_CREATE',
      entityType: 'RestaurantTable',
      entityId: table.id,
      entityRef: table.name,
      details: { capacity: table.capacity, floor: table.floor },
    });
    return this.get(table.id);
  }

  /**
   * Create tables T1…Tn in one step. Existing tables are skipped (archived
   * numbers are restored), so the operation is safe to repeat.
   */
  async createMany(input: BulkTableInput, userId: string): Promise<BulkTableResult> {
    const prisma = getPrisma();
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 200) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Number of tables must be a whole number between 1 and 200',
        400,
      );
    }
    const capacity = validateCapacity(input.capacity);
    const floor = validateFloor(input.floor);
    const names = Array.from({ length: count }, (_, index) => `T${index + 1}`);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.restaurantTable.findMany({
        where: { name: { in: names } },
      });
      const byName = new Map(existing.map((row) => [row.name, row]));
      const created: string[] = [];
      const skipped: string[] = [];

      for (const name of names) {
        const row = byName.get(name);
        if (row && !row.deletedAt) {
          skipped.push(name);
          continue;
        }

        if (row) {
          await tx.restaurantTable.update({
            where: { id: row.id },
            data: {
              deletedAt: null,
              isActive: true,
              status: TABLE_AVAILABLE,
              ...(capacity !== undefined ? { capacity } : {}),
              ...(floor !== undefined ? { floor } : {}),
            },
          });
        } else {
          await tx.restaurantTable.create({
            data: {
              name,
              capacity: capacity ?? 4,
              floor: floor ?? 1,
              status: TABLE_AVAILABLE,
            },
          });
        }
        created.push(name);
      }

      return { created, skipped };
    });

    await this.audit.log({
      userId,
      action: 'TABLE_BULK_CREATE',
      entityType: 'RestaurantTable',
      entityRef: `T1-T${count}`,
      details: {
        requested: count,
        created: result.created.length,
        skipped: result.skipped.length,
      },
    });

    return {
      requested: count,
      created: result.created,
      skipped: result.skipped,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
    };
  }

  async update(tableId: string, input: TableUpdateInput, userId: string) {
    const prisma = getPrisma();
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, deletedAt: null },
    });
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);

    const data: Prisma.RestaurantTableUpdateInput = {};
    if (input.number !== undefined) {
      const number = validateNumber(input.number);
      if (number !== table.name) {
        const duplicate = await prisma.restaurantTable.findUnique({ where: { name: number } });
        if (duplicate && duplicate.id !== table.id) {
          throw new AppError('TABLE_EXISTS', `Table ${number} already exists`, 409);
        }
        data.name = number;
      }
    }
    if (input.capacity !== undefined) data.capacity = validateCapacity(input.capacity);
    if (input.floor !== undefined) data.floor = validateFloor(input.floor);
    if (input.isActive !== undefined) {
      if (!input.isActive) {
        const openOrder = await prisma.restaurantOrder.findFirst({
          where: { tableId, status: ORDER_OPEN, deletedAt: null },
          select: { id: true },
        });
        if (openOrder) {
          throw new AppError(
            'TABLE_OCCUPIED',
            'This table has an open bill. Generate or void the bill before deactivating it.',
            409,
          );
        }
      }
      data.isActive = input.isActive;
    }

    if (Object.keys(data).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update', 400);
    }

    const updated = await prisma.restaurantTable.update({ where: { id: tableId }, data });

    await this.audit.log({
      userId,
      action: 'TABLE_UPDATE',
      entityType: 'RestaurantTable',
      entityId: tableId,
      entityRef: updated.name,
      details: { fields: Object.keys(data) },
    });
    return this.get(tableId);
  }

  /** Soft delete. A table with an open bill must be billed or voided first. */
  async remove(tableId: string, userId: string) {
    const prisma = getPrisma();
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, deletedAt: null },
    });
    if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);

    const openOrder = await prisma.restaurantOrder.findFirst({
      where: { tableId, status: ORDER_OPEN, deletedAt: null },
      select: { id: true },
    });
    if (openOrder) {
      throw new AppError(
        'TABLE_OCCUPIED',
        'This table has an open bill. Generate or void the bill before deleting the table.',
        409,
      );
    }

    await prisma.restaurantTable.update({
      where: { id: tableId },
      data: { deletedAt: new Date(), isActive: false, status: TABLE_AVAILABLE },
    });

    await this.audit.log({
      userId,
      action: 'TABLE_DELETE',
      entityType: 'RestaurantTable',
      entityId: tableId,
      entityRef: table.name,
    });
    return { deleted: true };
  }

  /**
   * Add food items to a table's running bill. Creates the open order on the
   * first item, re-reads menu price/tax server-side and snapshots them.
   */
  async addItems(tableId: string, input: AddOrderItemsInput, userId: string) {
    if (!input.items?.length) {
      throw new AppError('EMPTY_ORDER', 'Add at least one item', 400);
    }
    const prisma = getPrisma();
    const igst = await this.useIgst();

    const orderId = await prisma.$transaction(async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, deletedAt: null },
      });
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);
      if (!table.isActive) {
        throw new AppError('TABLE_INACTIVE', 'This table is inactive', 409);
      }

      let order = await tx.restaurantOrder.findFirst({
        where: { tableId, status: ORDER_OPEN, deletedAt: null },
      });
      if (!order) {
        order = await tx.restaurantOrder.create({
          data: {
            orderNumber: await nextNumber(tx, 'ORD'),
            orderType: 'DINE_IN',
            status: ORDER_OPEN,
            tableId,
            createdById: userId,
          },
        });
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: TABLE_OCCUPIED },
        });
      }

      for (const line of input.items) {
        const quantity = validateQuantity(line.quantity);
        const notes = line.notes?.trim() || null;
        const menuItem = await tx.menuItem.findFirst({
          where: { id: line.menuItemId, deletedAt: null, isActive: true },
        });
        if (!menuItem) {
          throw new AppError(
            'MENU_ITEM_NOT_FOUND',
            'A selected menu item no longer exists',
            404,
          );
        }
        if (!menuItem.isAvailable) {
          throw new AppError(
            'MENU_ITEM_UNAVAILABLE',
            `"${menuItem.name}" is no longer available`,
            409,
          );
        }

        const existingLine = await tx.restaurantOrderItem.findFirst({
          where: { orderId: order.id, menuItemId: menuItem.id, notes },
        });

        if (existingLine) {
          const newQuantity = new Decimal(existingLine.quantity.toString()).plus(quantity);
          await tx.restaurantOrderItem.update({
            where: { id: existingLine.id },
            data: {
              quantity: newQuantity.toString(),
              lineTotal: lineAmount(newQuantity, existingLine.unitPrice),
            },
          });
        } else {
          await tx.restaurantOrderItem.create({
            data: {
              orderId: order.id,
              menuItemId: menuItem.id,
              name: menuItem.name,
              quantity: String(quantity),
              unitPrice: menuItem.price.toString(),
              taxRate: menuItem.taxRate.toString(),
              lineTotal: lineAmount(quantity, menuItem.price),
              notes,
            },
          });
        }
      }

      await this.recalculateOrder(tx, order.id, igst);
      return order.id;
    });

    await this.audit.log({
      userId,
      action: 'TABLE_ORDER_ADD',
      entityType: 'RestaurantOrder',
      entityId: orderId,
      entityRef: tableId,
      details: { items: input.items.length },
    });
    return this.get(tableId);
  }

  /** Remove one line from an unbilled running order. */
  async removeOrderItem(tableId: string, itemId: string, userId: string) {
    const prisma = getPrisma();
    const igst = await this.useIgst();

    await prisma.$transaction(async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, deletedAt: null },
      });
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);

      const order = await tx.restaurantOrder.findFirst({
        where: { tableId, status: ORDER_OPEN, deletedAt: null },
      });
      if (!order) {
        throw new AppError('NO_OPEN_BILL', 'This table has no open bill', 409);
      }

      const item = await tx.restaurantOrderItem.findFirst({
        where: { id: itemId, orderId: order.id },
      });
      if (!item) throw new AppError('ORDER_ITEM_NOT_FOUND', 'Order item not found', 404);

      await this.deleteOrderItem(tx, tableId, order.id, itemId, igst);
    });

    await this.audit.log({
      userId,
      action: 'TABLE_ORDER_ITEM_REMOVE',
      entityType: 'RestaurantOrderItem',
      entityId: itemId,
      entityRef: tableId,
    });
    return this.get(tableId);
  }

  /**
   * Set an item's quantity on a table's running bill. Increasing or reducing
   * the quantity keeps the original price/tax snapshot; setting it to 0
   * removes the line and frees the table when it was the last item.
   */
  async setOrderItemQuantity(
    tableId: string,
    itemId: string,
    quantity: number,
    userId: string,
  ) {
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      throw new AppError(
        'INVALID_QUANTITY',
        'Quantity must be a whole number between 0 and 999',
        400,
      );
    }

    const prisma = getPrisma();
    const igst = await this.useIgst();

    let updatedQuantity = quantity;
    await prisma.$transaction(async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, deletedAt: null },
      });
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);

      const order = await tx.restaurantOrder.findFirst({
        where: { tableId, status: ORDER_OPEN, deletedAt: null },
      });
      if (!order) {
        throw new AppError('NO_OPEN_BILL', 'This table has no open bill', 409);
      }

      const item = await tx.restaurantOrderItem.findFirst({
        where: { id: itemId, orderId: order.id },
      });
      if (!item) throw new AppError('ORDER_ITEM_NOT_FOUND', 'Order item not found', 404);

      if (quantity === 0) {
        await this.deleteOrderItem(tx, tableId, order.id, itemId, igst);
        return;
      }

      updatedQuantity = quantity;
      await tx.restaurantOrderItem.update({
        where: { id: itemId },
        data: {
          quantity: String(quantity),
          lineTotal: lineAmount(quantity, item.unitPrice),
        },
      });
      await this.recalculateOrder(tx, order.id, igst);
    });

    await this.audit.log({
      userId,
      action: 'TABLE_ORDER_ITEM_UPDATE',
      entityType: 'RestaurantOrderItem',
      entityId: itemId,
      entityRef: tableId,
      details: { quantity: updatedQuantity },
    });
    return this.get(tableId);
  }

  /** Void an unbilled table bill and free the table. No financial record is created. */
  async cancelOpenOrder(tableId: string, userId: string) {
    const prisma = getPrisma();

    const order = await prisma.$transaction(async (tx) => {
      const order = await tx.restaurantOrder.findFirst({
        where: { tableId, status: ORDER_OPEN, deletedAt: null },
      });
      if (!order) {
        throw new AppError('NO_OPEN_BILL', 'This table has no open bill', 409);
      }
      const cancelled = await tx.restaurantOrder.update({
        where: { id: order.id },
        data: { status: ORDER_CANCELLED },
      });
      await tx.restaurantTable.update({
        where: { id: tableId },
        data: { status: TABLE_AVAILABLE },
      });
      return cancelled;
    });

    await this.audit.log({
      userId,
      action: 'TABLE_ORDER_CANCEL',
      entityType: 'RestaurantOrder',
      entityId: order.id,
      entityRef: order.orderNumber,
    });
    return this.get(tableId);
  }

  /**
   * Finalize the table's running bill into a normal Invoice, mark the order
   * BILLED and free the table. Uses the same server-side money engine and
   * idempotency key handling as counter bills.
   */
  async checkout(tableId: string, input: CheckoutTableInput, userId: string) {
    const prisma = getPrisma();
    const settings = await this.settings.all();
    const igst = settings.useIgst === 'true';

    if (input.clientRequestId) {
      const existing = await prisma.invoice.findUnique({
        where: { clientRequestId: input.clientRequestId },
      });
      if (existing) return this.bills.get(existing.id);
    }

    const invoiceId = await prisma.$transaction(async (tx) => {
      const table = await tx.restaurantTable.findFirst({
        where: { id: tableId, deletedAt: null },
      });
      if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);

      if (input.clientRequestId) {
        const existing = await tx.invoice.findUnique({
          where: { clientRequestId: input.clientRequestId },
        });
        if (existing) return existing.id;
      }

      const order = await tx.restaurantOrder.findFirst({
        where: { tableId, status: ORDER_OPEN, deletedAt: null },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      if (!order) {
        throw new AppError('NO_OPEN_BILL', 'This table has no open bill to settle', 409);
      }
      if (order.items.length === 0) {
        throw new AppError('EMPTY_BILL', 'Add at least one item before generating the bill', 400);
      }

      const breakdown = computeOrderTotals(order.items, igst);
      const billNumber = await nextNumber(tx, 'INV', {
        prefixOverride: settings.invoicePrefix,
      });

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber: billNumber,
          clientRequestId: input.clientRequestId ?? null,
          status: 'PAID',
          guestName: input.customerName?.trim() || null,
          guestMobile: input.customerMobile?.trim() || null,
          subtotal: breakdown.subtotal,
          discountAmount: breakdown.itemDiscount,
          taxableAmount: breakdown.taxableAmount,
          cgstAmount: breakdown.cgst,
          sgstAmount: breakdown.sgst,
          igstAmount: breakdown.igst,
          totalTax: breakdown.totalTax,
          roundingAmount: breakdown.rounding,
          grandTotal: breakdown.grandTotal,
          paidAmount: breakdown.grandTotal,
          dueAmount: '0',
          notes: input.notes?.trim() || `Table ${table.name}`,
          terms: settings.termsAndConditions ?? null,
          createdById: userId,
          items: {
            create: order.items.map((item, index) => ({
              description: item.name,
              quantity: item.quantity.toString(),
              unitPrice: item.unitPrice.toString(),
              taxRate: item.taxRate.toString(),
              lineTotal: lineAmount(item.quantity, item.unitPrice),
              sourceType: 'RESTAURANT',
              sourceOrderId: order.id,
              sortOrder: index,
            })),
          },
        },
      });

      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: {
          status: ORDER_BILLED,
          subtotal: breakdown.subtotal,
          discountAmount: breakdown.itemDiscount,
          taxAmount: breakdown.totalTax,
          cgstAmount: breakdown.cgst,
          sgstAmount: breakdown.sgst,
          igstAmount: breakdown.igst,
          grandTotal: breakdown.grandTotal,
        },
      });
      await tx.restaurantTable.update({
        where: { id: tableId },
        data: { status: TABLE_AVAILABLE },
      });

      return invoice.id;
    });

    await this.audit.log({
      userId,
      action: 'TABLE_BILL_CREATE',
      entityType: 'Invoice',
      entityId: invoiceId,
      entityRef: tableId,
    });
    return this.bills.get(invoiceId);
  }

  /** Delete one line and free the table/order when nothing remains. */
  private async deleteOrderItem(
    tx: Prisma.TransactionClient,
    tableId: string,
    orderId: string,
    itemId: string,
    useIgst: boolean,
  ): Promise<void> {
    await tx.restaurantOrderItem.delete({ where: { id: itemId } });

    const remaining = await tx.restaurantOrderItem.count({ where: { orderId } });
    if (remaining === 0) {
      await tx.restaurantOrder.delete({ where: { id: orderId } });
      await tx.restaurantTable.update({
        where: { id: tableId },
        data: { status: TABLE_AVAILABLE },
      });
    } else {
      await this.recalculateOrder(tx, orderId, useIgst);
    }
  }

  private async recalculateOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    useIgst: boolean,
  ): Promise<MoneyBreakdown> {
    const items = await tx.restaurantOrderItem.findMany({ where: { orderId } });
    const breakdown = computeOrderTotals(items, useIgst);
    await tx.restaurantOrder.update({
      where: { id: orderId },
      data: {
        subtotal: breakdown.subtotal,
        discountAmount: breakdown.itemDiscount,
        taxAmount: breakdown.totalTax,
        cgstAmount: breakdown.cgst,
        sgstAmount: breakdown.sgst,
        igstAmount: breakdown.igst,
        grandTotal: breakdown.grandTotal,
      },
    });
    return breakdown;
  }

  private serializeTable(table: TableWithOpenOrder, useIgst: boolean) {
    const order = table.orders[0];
    // An open bill always wins: a table cannot be deactivated while it is billing.
    const status = order ? TABLE_OCCUPIED : !table.isActive ? 'INACTIVE' : TABLE_AVAILABLE;

    return {
      id: table.id,
      number: table.name,
      capacity: table.capacity,
      floor: table.floor,
      status,
      isActive: table.isActive,
      createdAt: table.createdAt,
      openBill: order ? this.serializeOrder(order, useIgst) : null,
    };
  }

  private serializeOrder(order: OrderWithItems, useIgst: boolean) {
    const breakdown = computeOrderTotals(order.items, useIgst);
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      openedAt: order.createdAt,
      createdBy: order.createdBy?.fullName ?? null,
      itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
      lineCount: order.items.length,
      subtotal: breakdown.subtotal,
      tax: breakdown.totalTax,
      total: breakdown.grandTotal,
      items: order.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        taxRate: item.taxRate.toString(),
        lineTotal: item.lineTotal.toString(),
        notes: item.notes,
      })),
    };
  }
}
