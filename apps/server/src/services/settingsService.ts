import { getPrisma } from '../utils/prisma';

/**
 * Typed access to the hotel settings key-value store with sane defaults.
 * Used by billing (tax rates), numbering (prefixes), backup scheduler, etc.
 */
export class SettingsService {
  async all(): Promise<Record<string, string>> {
    const prisma = getPrisma();
    const hotel = await prisma.hotel.findFirst();
    if (!hotel) return {};
    const rows = await prisma.hotelSetting.findMany({ where: { hotelId: hotel.id } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async get(key: string): Promise<string | undefined> {
    const all = await this.all();
    return all[key];
  }

  async setMany(values: Record<string, string>): Promise<void> {
    const prisma = getPrisma();
    const hotel = await prisma.hotel.findFirst();
    if (!hotel) return;
    for (const [key, value] of Object.entries(values)) {
      await prisma.hotelSetting.upsert({
        where: { hotelId_key: { hotelId: hotel.id, key } },
        update: { value },
        create: { hotelId: hotel.id, key, value },
      });
    }
  }
}
