import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';

export interface MenuItemInput {
  name: string;
  sku?: string;
  categoryId: string;
  price: string;
  taxRate?: string;
  description?: string;
  isAvailable?: boolean;
}

export interface MenuItemUpdateInput {
  name?: string;
  sku?: string;
  categoryId?: string;
  price?: string;
  taxRate?: string;
  description?: string;
  isAvailable?: boolean;
}

export interface MenuListOptions {
  search?: string;
  categoryId?: string;
  availableOnly?: boolean;
}

/**
 * Menu / item management. Menu items are the catalog used by the billing
 * interface; bills snapshot name + price at billing time, so editing an item
 * never rewrites history.
 */
export class MenuService {
  private audit = new AuditService();

  /** Categories (non-deleted) each with their items, filtered by query. */
  async list(opts: MenuListOptions = {}) {
    const prisma = getPrisma();

    const categories = await prisma.menuCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const items = await prisma.menuItem.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
        ...(opts.availableOnly ? { isAvailable: true } : {}),
        ...(opts.search
          ? { name: { contains: opts.search } }
          : {}),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });

    return {
      categories,
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        price: i.price.toString(),
        taxRate: i.taxRate.toString(),
        description: i.description,
        isAvailable: i.isAvailable,
        categoryId: i.categoryId,
        categoryName: i.category.name,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
    };
  }

  async createCategory(name: string, userId: string) {
    const prisma = getPrisma();
    const trimmed = name.trim();
    if (!trimmed) throw new AppError('VALIDATION_ERROR', 'Category name is required', 400);

    const dup = await prisma.menuCategory.findFirst({ where: { name: trimmed, deletedAt: null } });
    if (dup) throw new AppError('CATEGORY_EXISTS', `Category "${trimmed}" already exists`, 409);

    const max = await prisma.menuCategory.aggregate({ _max: { sortOrder: true } });
    const record = await prisma.menuCategory.create({
      data: { name: trimmed, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });

    await this.audit.log({
      userId,
      action: 'MENU_CATEGORY_CREATE',
      entityType: 'MenuCategory',
      entityId: record.id,
      entityRef: record.name,
    });
    return record;
  }

  async createItem(input: MenuItemInput, userId: string) {
    const prisma = getPrisma();

    const category = await prisma.menuCategory.findFirst({
      where: { id: input.categoryId, deletedAt: null },
    });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);

    const name = input.name.trim();
    if (!name) throw new AppError('VALIDATION_ERROR', 'Item name is required', 400);

    const price = Number(input.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Price must be greater than 0', 400);
    }
    const taxRate = Number(input.taxRate ?? '0');
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new AppError('VALIDATION_ERROR', 'Tax rate must be between 0 and 100', 400);
    }

    const dupName = await prisma.menuItem.findFirst({
      where: { name, categoryId: input.categoryId, deletedAt: null },
    });
    if (dupName) {
      throw new AppError('ITEM_EXISTS', `Item "${name}" already exists in this category`, 409);
    }
    if (input.sku) {
      const dupSku = await prisma.menuItem.findFirst({ where: { sku: input.sku } });
      if (dupSku) throw new AppError('SKU_EXISTS', `SKU ${input.sku} already exists`, 409);
    }

    const item = await prisma.menuItem.create({
      data: {
        name,
        sku: input.sku || null,
        categoryId: input.categoryId,
        price: price.toFixed(2),
        taxRate: taxRate.toFixed(2),
        description: input.description || null,
        isAvailable: input.isAvailable ?? true,
      },
    });

    await this.audit.log({
      userId,
      action: 'MENU_ITEM_CREATE',
      entityType: 'MenuItem',
      entityId: item.id,
      entityRef: item.name,
      details: { price: item.price.toString() },
    });
    return this.serialize(item);
  }

  async updateItem(id: string, input: MenuItemUpdateInput, userId: string) {
    const prisma = getPrisma();
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new AppError('MENU_ITEM_NOT_FOUND', 'Menu item not found', 404);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new AppError('VALIDATION_ERROR', 'Item name is required', 400);
      data.name = name;
    }
    if (input.price !== undefined) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price <= 0) {
        throw new AppError('VALIDATION_ERROR', 'Price must be greater than 0', 400);
      }
      data.price = price.toFixed(2);
    }
    if (input.taxRate !== undefined) {
      const taxRate = Number(input.taxRate);
      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new AppError('VALIDATION_ERROR', 'Tax rate must be between 0 and 100', 400);
      }
      data.taxRate = taxRate.toFixed(2);
    }
    if (input.categoryId !== undefined) {
      const category = await prisma.menuCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
      });
      if (!category) throw new AppError('CATEGORY_NOT_FOUND', 'Category not found', 404);
      data.categoryId = input.categoryId;
    }
    if (input.sku !== undefined) data.sku = input.sku || null;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.isAvailable !== undefined) data.isAvailable = input.isAvailable;

    if (Object.keys(data).length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No fields to update', 400);
    }

    const updated = await prisma.menuItem.update({ where: { id }, data });

    await this.audit.log({
      userId,
      action: 'MENU_ITEM_UPDATE',
      entityType: 'MenuItem',
      entityId: id,
      entityRef: updated.name,
      details: { fields: Object.keys(data) },
    });
    return this.serialize(updated);
  }

  /**
   * Soft-delete an item. Existing bills keep their own name/price snapshot,
   * so history is unaffected. Use `isAvailable` for temporary unavailability.
   */
  async deleteItem(id: string, userId: string) {
    const prisma = getPrisma();
    const item = await prisma.menuItem.findFirst({ where: { id, deletedAt: null } });
    if (!item) throw new AppError('MENU_ITEM_NOT_FOUND', 'Menu item not found', 404);

    await prisma.menuItem.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.audit.log({
      userId,
      action: 'MENU_ITEM_DELETE',
      entityType: 'MenuItem',
      entityId: id,
      entityRef: item.name,
    });
    return { deleted: true };
  }

  private serialize(item: {
    id: string;
    name: string;
    sku: string | null;
    price: { toString(): string };
    taxRate: { toString(): string };
    description: string | null;
    isAvailable: boolean;
    categoryId: string;
  }) {
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      price: item.price.toString(),
      taxRate: item.taxRate.toString(),
      description: item.description,
      isAvailable: item.isAvailable,
      categoryId: item.categoryId,
    };
  }
}
