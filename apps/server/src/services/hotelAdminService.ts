import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';
import { AuditService } from './auditService';
import { SettingsService } from './settingsService';

const EDITABLE_FIELDS = [
  'name',
  'address',
  'city',
  'state',
  'country',
  'phone',
  'email',
  'website',
  'gstin',
  'pan',
] as const;

const EDITABLE_SETTINGS = [
  'currency',
  'invoicePrefix',
  'invoiceNumberFormat',
  'orderPrefix',
  'kotPrefix',
  'paymentPrefix',
  'bookingPrefix',
  'receiptFooter',
  'termsAndConditions',
  'cgstRate',
  'sgstRate',
  'igstRate',
  'useIgst',
  'roundingMode',
  'backupFrequency',
  'backupKeepCount',
  'theme',
  'checkoutRoomStatus',
] as const;

export class HotelAdminService {
  private audit = new AuditService();
  private settings = new SettingsService();

  async getProfile() {
    const prisma = getPrisma();
    const hotel = await prisma.hotel.findFirst();
    if (!hotel) throw new AppError('HOTEL_NOT_CONFIGURED', 'Hotel profile is not configured', 404);
    return hotel;
  }

  async updateProfile(
    input: Partial<Record<(typeof EDITABLE_FIELDS)[number], string>>,
    userId: string,
  ) {
    const prisma = getPrisma();
    const hotel = await this.getProfile();
    const data: Record<string, string> = {};
    for (const field of EDITABLE_FIELDS) {
      if (input[field] !== undefined) data[field] = input[field];
    }
    const updated = await prisma.hotel.update({ where: { id: hotel.id }, data });

    await this.audit.log({
      userId,
      action: 'SETTINGS_CHANGE',
      entityType: 'Hotel',
      entityId: hotel.id,
      entityRef: updated.name,
      details: { fields: Object.keys(data) },
    });
    return updated;
  }

  async updateSettings(values: Record<string, string>, userId: string) {
    const allowed: Record<string, string> = {};
    for (const key of EDITABLE_SETTINGS) {
      if (values[key] !== undefined) allowed[key] = values[key];
    }
    if (Object.keys(allowed).length === 0) {
      throw new AppError('NO_VALID_SETTINGS', 'No editable settings provided', 400);
    }

    // Changing tax settings is a sensitive operation
    const taxKeys = ['cgstRate', 'sgstRate', 'igstRate', 'useIgst'];
    if (taxKeys.some((k) => k in allowed)) {
      await this.audit.log({
        userId,
        action: 'TAX_SETTINGS_CHANGE',
        entityType: 'HotelSetting',
        details: allowed,
      });
    }

    await this.settings.setMany(allowed);
    await this.audit.log({
      userId,
      action: 'SETTINGS_CHANGE',
      entityType: 'HotelSetting',
      details: { keys: Object.keys(allowed) },
    });
    return this.settings.all();
  }
}
