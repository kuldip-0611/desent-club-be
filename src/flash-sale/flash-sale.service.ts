import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFlashSaleDto {
  title: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
  productIds: string[];
}

export type UpdateFlashSaleDto = Partial<CreateFlashSaleDto>;

@Injectable()
export class FlashSaleService {
  constructor(private readonly prisma: PrismaService) {}

  async getActive() {
    const now = new Date();
    return this.prisma.flashSale.findFirst({
      where: {
        isActive: true,
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  async listAll() {
    return this.prisma.flashSale.findMany({ orderBy: { startsAt: 'desc' } });
  }

  async create(dto: CreateFlashSaleDto) {
    await this.assertProductsExist(dto.productIds);
    return this.prisma.flashSale.create({
      data: {
        title: dto.title,
        discountPercent: dto.discountPercent,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive ?? true,
        productIds: dto.productIds,
      },
    });
  }

  async update(id: string, dto: UpdateFlashSaleDto) {
    await this.ensureExists(id);
    if (dto.productIds !== undefined) {
      await this.assertProductsExist(dto.productIds);
    }
    return this.prisma.flashSale.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
        ...(dto.startsAt !== undefined ? { startsAt: new Date(dto.startsAt) } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: new Date(dto.endsAt) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.flashSale.delete({ where: { id } });
    return { message: 'Flash sale deleted' };
  }

  private async ensureExists(id: string) {
    const row = await this.prisma.flashSale.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException('Flash sale not found');
  }

  private async assertProductsExist(productIds: string[]): Promise<void> {
    if (!productIds || productIds.length === 0) return;
    const unique = [...new Set(productIds)];
    const found = await this.prisma.product.count({
      where: { id: { in: unique } },
    });
    if (found !== unique.length) {
      throw new BadRequestException(
        'One or more product IDs in the flash sale do not exist.',
      );
    }
  }
}
