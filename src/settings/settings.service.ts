import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface StoreSettingsDto {
  defaultGstRate?: number;
  storeName?: string;
  supportEmail?: string;
  supportPhone?: string;
  currency?: string;
  freeShippingThreshold?: number;
}

const DEFAULTS: Record<string, string> = {
  defaultGstRate: '18',
  storeName: 'Disent Club',
  supportEmail: '',
  supportPhone: '',
  currency: 'INR',
  freeShippingThreshold: '999',
  shippingFee: '99',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.storeSetting.findMany();
    const map: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      map[row.key] = row.value;
    }
    return map;
  }

  async updateMany(updates: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        this.prisma.storeSetting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
  }
}
