import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { SettingsService } from './settingsService';
import { nextNumber } from './sequenceService';
import { calculateBilling, type BillingLineInput } from '@hotel-billing/shared';
import type { Prisma } from '@prisma/client';

const OPEN_ORDER_STATUSES = ['DRAFT', 'HELD', 'SENT', 'PREPARING', 'READY', 'COMPLETED'];

export interface OrderItemInput {
  menuItemId: string;
  quantity: string;
  notes?: string;
  discountAmount?: string;
}

export interface CreateOrderInput {
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'ROOM_SERVICE';
  tableId?: string;
  roomId?: string;
  bookingId?: string;
  guestName?: string;
  items: OrderItemInput[];
  orderDiscountAmount?: string;
  notes?: string;
}

export class RestaurantService {
  private audit = new AuditService();
  private settings = new SettingsService();

  // ─── Menu ─────────────────────────────────────────────────────
  async listCategories() {
    const prisma = getPrisma();
    return prisma.menuCategory.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        items: {
          where: { deletedAt: null, isActive: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createCategory(name: string, userId: string) {
    const prisma = getPrisma();
    const dup = await prisma.menuCategory.findFirst({ where: { name } });
    if (dup) throw new AppError('CATEGORY_EXISTS', `Category "${name}" exists`, 409);
    const record = await prisma.menuCategory.create({ data: { name } });
    await this.audit.log({
      userId,
      action: 'MENU_CATEGORY_CREATE',
      entityType: 'MenuCategory',
      entityId: record.id,
      entityRef: name,
    });
    return record;
  }

  async createMenuItem(
    input: {
      name: string;
      sku?: string;
      categoryId: string;
      price: string;
      taxRate?: string;
      description?: string;
      kitchenName?: string;
    },
    userId: string,
  ) {
    const prisma = getPrisma();
    const category = await prisma.menuCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
    });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);

    if (input.sku) {
      const dup = await prisma.menuItem.findFirst({ where: { sku: input.sku } });
      if (dup) throw new AppError('SKU_EXISTS', `SKU ${input.sku} already exists`, 409);
    }

    const item = await prisma.menuItem.create({ data: { ...input } });
    await this.audit.log({
      userId,
      action: 'MENU_ITEM_CREATE',
      entityType: 'MenuItem',
      entityId: item.id,
      entityRef: item.name,
    });
    return item;
  }

  async updateMenuItem(
    id: string,
    input: Partial<{
      name: string;
      sku: string;
      price: string;
      taxRate: string;
      description: string;
      kitchenName: string;
      isAvailable: boolean;
      isActive: boolean;
    }>,
    userId: string,
  ) {
    const prisma = getPrisma();
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new AppError('MENU_ITEM_NOT_FOUND', 'Menu item not found', 404);
    const updated = await prisma.menuItem.update({ where: { id }, data: input });
    await this.audit.log({
      userId,
      action: 'MENU_ITEM_UPDATE',
      entityType: 'MenuItem',
      entityId: id,
      entityRef: item.name,
    });
    return updated;
  }

  // ─── Tables ───────────────────────────────────────────────────
  async listTables() {
    const prisma = getPrisma();
    return prisma.restaurantTable.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        orders: {
          where: { status: { in: OPEN_ORDER_STATUSES }, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createTable(name: string, capacity: number, userId: string) {
    const prisma = getPrisma();
    const dup = await prisma.restaurantTable.findFirst({ where: { name } });
    if (dup) throw new AppError('TABLE_EXISTS', `Table "${name}" exists`, 409);
    const record = await prisma.restaurantTable.create({ data: { name, capacity } });
    await this.audit.log({
      userId,
      action: 'TABLE_CREATE',
      entityType: 'RestaurantTable',
      entityId: record.id,
      entityRef: name,
    });
    return record;
  }

  // ─── Orders ───────────────────────────────────────────────────
  async listOrders(opts: { status?: string; tableId?: string; page?: number; pageSize?: number }) {
    const prisma = getPrisma();
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));

    const where: Prisma.RestaurantOrderWhereInput = { deletedAt: null };
    if (opts.status) where.status = opts.status;
    if (opts.tableId) where.tableId = opts.tableId;

    const [total, items] = await Promise.all([
      prisma.restaurantOrder.count({ where }),
      prisma.restaurantOrder.findMany({
        where,
        include: {
          items: true,
          table: true,
          room: true,
          booking: { include: { guest: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Build billing lines from menu items, re-validating prices server-side. */
  private async buildBillingItems(
    tx: Prisma.TransactionClient,
    items: OrderItemInput[],
    orderDiscountAmount?: string,
  ) {
    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';

    const billingItems: BillingLineInput[] = [];
    const orderItemData: Array<{
      menuItemId: string | null;
      name: string;
      quantity: string;
      unitPrice: string;
      discountAmount: string;
      taxRate: string;
      taxAmount: string;
      lineTotal: string;
      notes?: string;
    }> = [];

    for (const line of items) {
      const menuItem = await tx.menuItem.findFirst({
        where: { id: line.menuItemId, deletedAt: null, isAvailable: true },
      });
      if (!menuItem) {
        throw new AppError(
          'MENU_ITEM_UNAVAILABLE',
          `Menu item ${line.menuItemId} is unavailable`,
          400,
        );
      }

      const qty = Number(line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new AppError('INVALID_QUANTITY', 'Quantity must be positive', 400);
      }

      const price = Number(menuItem.price.toString());
      const discount = Number(line.discountAmount ?? '0');
      const taxRate = Number(menuItem.taxRate.toString());
      const gross = qty * price;
      const taxable = Math.max(0, gross - discount);
      const taxAmount = (taxable * taxRate) / 100;

      const halfRate = (taxRate / 2).toFixed(4);
      billingItems.push({
        quantity: line.quantity,
        unitPrice: menuItem.price.toString(),
        discountAmount: line.discountAmount,
        ...(useIgst
          ? { igstRate: menuItem.taxRate.toString() }
          : { cgstRate: halfRate, sgstRate: halfRate }),
      });

      orderItemData.push({
        menuItemId: menuItem.id,
        name: menuItem.kitchenName ?? menuItem.name,
        quantity: line.quantity,
        unitPrice: menuItem.price.toString(),
        discountAmount: discount.toFixed(2),
        taxRate: menuItem.taxRate.toString(),
        taxAmount: taxAmount.toFixed(2),
        lineTotal: taxable.toFixed(2),
        notes: line.notes,
      });
    }

    const breakdown = calculateBilling({ items: billingItems, useIgst, orderDiscountAmount });
    return { breakdown, orderItemData };
  }

  async createOrder(input: CreateOrderInput, userId: string) {
    const prisma = getPrisma();
    if (!input.items?.length) {
      throw new AppError('EMPTY_ORDER', 'Order needs at least one item', 400);
    }
    if (input.orderType === 'DINE_IN' && !input.tableId) {
      throw new AppError('TABLE_REQUIRED', 'Dine-in orders need a table', 400);
    }
    if (input.orderType === 'ROOM_SERVICE' && !input.bookingId) {
      throw new AppError('ROOM_SERVICE_NEEDS_STAY', 'Room service needs an active stay', 400);
    }

    const settings = await this.settings.all();

    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextNumber(tx, 'ORD', { prefixOverride: settings.orderPrefix });
      const kotNumber = await nextNumber(tx, 'KOT', { prefixOverride: settings.kotPrefix });

      const { breakdown, orderItemData } = await this.buildBillingItems(
        tx,
        input.items,
        input.orderDiscountAmount,
      );

      let tableId: string | null = null;
      let roomId: string | null = null;
      let bookingId: string | null = null;

      if (input.tableId) {
        const table = await tx.restaurantTable.findFirst({
          where: { id: input.tableId, deletedAt: null },
        });
        if (!table) throw new AppError('TABLE_NOT_FOUND', 'Table not found', 404);
        tableId = table.id;
      }

      if (input.orderType === 'ROOM_SERVICE') {
        const booking = await tx.booking.findFirst({
          where: { id: input.bookingId!, deletedAt: null, status: 'CHECKED_IN' },
        });
        if (!booking) {
          throw new AppError('STAY_NOT_FOUND', 'No active stay found for room service', 404);
        }
        bookingId = booking.id;
        roomId = booking.roomId;
      }

      return tx.restaurantOrder.create({
        data: {
          orderNumber,
          kotNumber,
          orderType: input.orderType,
          status: 'SENT',
          tableId,
          roomId,
          bookingId,
          guestName: input.guestName,
          notes: input.notes,
          subtotal: breakdown.subtotal,
          discountAmount: breakdown.itemDiscount,
          taxAmount: breakdown.totalTax,
          cgstAmount: breakdown.cgst,
          sgstAmount: breakdown.sgst,
          igstAmount: breakdown.igst,
          grandTotal: breakdown.grandTotal,
          createdById: userId,
          items: { create: orderItemData },
        },
        include: {
          items: true,
          table: true,
          room: true,
          booking: { include: { guest: true } },
        },
      });
    });

    if (order.tableId && input.orderType === 'DINE_IN') {
      await prisma.restaurantTable.update({
        where: { id: order.tableId },
        data: { status: 'OCCUPIED' },
      });
    }

    await this.audit.log({
      userId,
      action: 'RESTAURANT_ORDER_CREATE',
      entityType: 'RestaurantOrder',
      entityId: order.id,
      entityRef: order.orderNumber,
      details: { kot: order.kotNumber, total: order.grandTotal.toString() },
    });

    return order;
  }

  async getOrder(id: string) {
    const prisma = getPrisma();
    const order = await prisma.restaurantOrder.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, table: true, room: true, booking: { include: { guest: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    return order;
  }

  async cancelOrder(id: string, reason: string, userId: string) {
    const prisma = getPrisma();
    const order = await prisma.restaurantOrder.findFirst({ where: { id, deletedAt: null } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (order.status === 'CHARGED_TO_ROOM' || order.status === 'CANCELLED') {
      throw new AppError('ORDER_FINALIZED', `Order is ${order.status}`, 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.restaurantOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      if (order.tableId) {
        const otherOpen = await tx.restaurantOrder.count({
          where: {
            tableId: order.tableId,
            status: { in: OPEN_ORDER_STATUSES },
            id: { not: id },
            deletedAt: null,
          },
        });
        if (otherOpen === 0) {
          await tx.restaurantTable.update({
            where: { id: order.tableId },
            data: { status: 'AVAILABLE' },
          });
        }
      }
    });

    await this.audit.log({
      userId,
      action: 'RESTAURANT_ORDER_CANCEL',
      entityType: 'RestaurantOrder',
      entityId: id,
      entityRef: order.orderNumber,
      details: { reason },
    });
  }

  /** Add items to an existing open order (e.g. second round of drinks). */
  async addItems(id: string, items: OrderItemInput[], userId: string) {
    if (!items?.length) throw new AppError('EMPTY_ORDER', 'No items to add', 400);
    const prisma = getPrisma();
    const order = await prisma.restaurantOrder.findFirst({ where: { id, deletedAt: null } });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (order.status === 'CANCELLED' || order.status === 'CHARGED_TO_ROOM') {
      throw new AppError('ORDER_FINALIZED', `Order is ${order.status}`, 409);
    }

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';

    const updated = await prisma.$transaction(async (tx) => {
      const { orderItemData } = await this.buildBillingItems(tx, items);
      await tx.restaurantOrderItem.createMany({
        data: orderItemData.map((d) => ({ ...d, orderId: id })),
      });

      // Recompute totals over all items
      const allItems = await tx.restaurantOrderItem.findMany({ where: { orderId: id } });
      const billingItems: BillingLineInput[] = allItems.map((i) => ({
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        discountAmount: i.discountAmount.toString(),
        ...(useIgst
          ? { igstRate: i.taxRate.toString() }
          : {
              cgstRate: (Number(i.taxRate.toString()) / 2).toFixed(4),
              sgstRate: (Number(i.taxRate.toString()) / 2).toFixed(4),
            }),
      }));
      const newBreakdown = calculateBilling({ items: billingItems, useIgst });

      return tx.restaurantOrder.update({
        where: { id },
        data: {
          subtotal: newBreakdown.subtotal,
          discountAmount: newBreakdown.itemDiscount,
          taxAmount: newBreakdown.totalTax,
          cgstAmount: newBreakdown.cgst,
          sgstAmount: newBreakdown.sgst,
          igstAmount: newBreakdown.igst,
          grandTotal: newBreakdown.grandTotal,
          status: 'SENT',
        },
        include: { items: true, table: true, room: true },
      });
    });

    await this.audit.log({
      userId,
      action: 'RESTAURANT_ORDER_UPDATE',
      entityType: 'RestaurantOrder',
      entityId: id,
      entityRef: order.orderNumber,
    });
    return updated;
  }

  /** Pay-and-close a dine-in/takeaway order: creates the invoice + payments. */
  async payOrder(
    id: string,
    userId: string,
    opts: {
      payments: Array<{ method: string; amount: string; reference?: string }>;
      orderDiscountAmount?: string;
    },
  ) {
    const prisma = getPrisma();
    const order = await prisma.restaurantOrder.findFirst({
      where: { id, deletedAt: null },
      include: { items: true, table: true, booking: { include: { guest: true } } },
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND', 'Order not found', 404);
    if (order.status === 'CHARGED_TO_ROOM' || order.status === 'CANCELLED') {
      throw new AppError('ORDER_FINALIZED', `Order is ${order.status}`, 409);
    }

    const settings = await this.settings.all();
    const useIgst = settings.useIgst === 'true';

    const breakdown = calculateBilling({
      items: order.items.map((i) => ({
        quantity: i.quantity.toString(),
        unitPrice: i.unitPrice.toString(),
        discountAmount: i.discountAmount.toString(),
        ...(useIgst
          ? { igstRate: i.taxRate.toString() }
          : {
              cgstRate: (Number(i.taxRate.toString()) / 2).toFixed(4),
              sgstRate: (Number(i.taxRate.toString()) / 2).toFixed(4),
            }),
      })),
      useIgst,
      orderDiscountAmount: opts.orderDiscountAmount,
    });

    const payments = opts.payments;
    if (!payments?.length) {
      throw new AppError('PAYMENT_REQUIRED', 'At least one payment is required', 400);
    }
    const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const grandTotal = Number(breakdown.grandTotal);
    if (paid + 0.001 < grandTotal) {
      throw new AppError('UNDERPAYMENT', `Amount due is ${grandTotal.toFixed(2)}`, 400);
    }

    return prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextNumber(tx, 'INV', { prefixOverride: settings.invoicePrefix });
      const paymentNumbers: string[] = [];
      for (let i = 0; i < payments.length; i++) {
        paymentNumbers.push(await nextNumber(tx, 'PAY', { prefixOverride: settings.paymentPrefix }));
      }

      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          status: 'PAID',
          guestName: order.guestName ?? order.booking?.guest?.fullName ?? 'Walk-in',
          roomId: order.roomId,
          bookingId: order.bookingId,
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
          terms: settings.receiptFooter,
          createdById: userId,
          items: {
            create: order.items.map((i, idx) => ({
              description: `${i.name} × ${Number(i.quantity.toString())}`,
              quantity: i.quantity.toString(),
              unitPrice: i.unitPrice.toString(),
              discountAmount: i.discountAmount.toString(),
              taxRate: i.taxRate.toString(),
              lineTotal: i.lineTotal.toString(),
              sourceType: 'RESTAURANT',
              sourceOrderId: order.id,
              sortOrder: idx,
            })),
          },
          payments: {
            create: payments.map((p, i) => ({
              paymentNumber: paymentNumbers[i],
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              createdById: userId,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      await tx.restaurantOrder.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' },
      });

      if (order.tableId) {
        await tx.restaurantTable.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
      }

      return inv;
    });
  }
}
