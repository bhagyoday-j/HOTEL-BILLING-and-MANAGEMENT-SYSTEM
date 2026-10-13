import { getPrisma } from '../utils/prisma';
import { AppError } from '../utils/errors';

export class HotelService {
  async getHotel() {
    const prisma = getPrisma();
    const hotel = await prisma.hotel.findFirst({
      include: { settings: true },
    });
    if (!hotel) {
      throw new AppError('HOTEL_NOT_CONFIGURED', 'Hotel profile is not configured', 404);
    }
    return hotel;
  }

  async getSettings(): Promise<Record<string, string>> {
    const hotel = await this.getHotel();
    return Object.fromEntries(hotel.settings.map((s) => [s.key, s.value]));
  }
}
