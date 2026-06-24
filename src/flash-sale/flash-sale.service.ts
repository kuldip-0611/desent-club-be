import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateFlashSaleDto {
  title: string;
  discountPercent: number;
  startsAt: string;
  endsAt: string;
  isActive?: boolean;
  productIds: string[];
  categoryIds?: string[];
  subcategoryIds?: string[];
  scope?: 'ALL' | 'CATEGORY' | 'SUBCATEGORY' | 'PRODUCTS';
}

export type UpdateFlashSaleDto = Partial<CreateFlashSaleDto>;

@Injectable()
export class FlashSaleService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveAll() {
    const now = new Date();
    return this.prisma.flashSale.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: 'asc' },
    });
  }

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

  async getFlashSaleProductsById(saleId: string, page = 1, limit = 24) {
    const sale = await this.prisma.flashSale.findUnique({ where: { id: saleId } });
    if (!sale) return null;
    const productIds: string[] = (sale.productIds as string[]) ?? [];
    const skip = (page - 1) * limit;
    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      ...(productIds.length > 0 ? { id: { in: productIds } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, slug: true, name: true } },
          subcategory: { select: { id: true, slug: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    const discountPct = Number(sale.discountPercent);
    const items = rows.map((p) => {
      const mrp = Number(p.price);
      const existingDiscount = p.discountPercent ? Number(p.discountPercent) : 0;
      const effectiveDiscount = Math.max(existingDiscount, discountPct);
      const salePrice = Math.round(mrp * (100 - effectiveDiscount)) / 100;
      return {
        id: p.id, name: p.name,
        slug: (p as unknown as Record<string, unknown>)['slug'] ?? p.id,
        mrp, salePrice, discountPercent: effectiveDiscount,
        category: p.category, subcategory: p.subcategory,
        image: p.images[0]?.path ?? null,
        gstRate: p.gstRate !== undefined ? Number(p.gstRate) : 0.18,
      };
    });
    return {
      sale: { id: sale.id, title: sale.title, discountPercent: discountPct, endsAt: sale.endsAt, isActive: sale.isActive },
      items, total, page, limit, hasNextPage: skip + limit < total,
    };
  }

  async getFlashSaleProducts(page = 1, limit = 24) {
    const now = new Date();
    const sale = await this.prisma.flashSale.findFirst({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { startsAt: 'desc' },
    });
    if (!sale) return { sale: null, items: [], total: 0, page, limit, hasNextPage: false };

    const productIds: string[] = (sale.productIds as string[]) ?? [];
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      ...(productIds.length > 0 ? { id: { in: productIds } } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          category: { select: { id: true, slug: true, name: true } },
          subcategory: { select: { id: true, slug: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const discountPct = Number(sale.discountPercent);

    const items = rows.map((p) => {
      const mrp = Number(p.price);
      // use existing discountPercent if higher, otherwise apply flash sale discount
      const existingDiscount = p.discountPercent ? Number(p.discountPercent) : 0;
      const effectiveDiscount = Math.max(existingDiscount, discountPct);
      const salePrice = Math.round(mrp * (100 - effectiveDiscount)) / 100;
      return {
        id: p.id,
        name: p.name,
        slug: (p as unknown as Record<string, unknown>)['slug'] ?? p.id,
        mrp,
        salePrice,
        discountPercent: effectiveDiscount,
        category: p.category,
        subcategory: p.subcategory,
        image: p.images[0]?.path ?? null,
        gstRate: p.gstRate !== undefined ? Number(p.gstRate) : 0.18,
      };
    });

    return {
      sale: {
        id: sale.id,
        title: sale.title,
        discountPercent: discountPct,
        endsAt: sale.endsAt,
      },
      items,
      total,
      page,
      limit,
      hasNextPage: skip + limit < total,
    };
  }

  async getAllActiveSalesWithProducts() {
    const now = new Date();
    const sales = await this.prisma.flashSale.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
      orderBy: { endsAt: 'asc' },
    });
    if (sales.length === 0) return [];

    return Promise.all(
      sales.map(async (sale) => {
        const productIds: string[] = (sale.productIds as string[]) ?? [];
        const where: Prisma.ProductWhereInput = {
          isAvailable: true,
          ...(productIds.length > 0 ? { id: { in: productIds } } : {}),
        };
        const rows = await this.prisma.product.findMany({
          where,
          take: 24,
          orderBy: { createdAt: 'desc' },
          include: {
            category: { select: { id: true, slug: true, name: true } },
            subcategory: { select: { id: true, slug: true, name: true } },
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        });
        const total = await this.prisma.product.count({ where });
        const discountPct = Number(sale.discountPercent);
        const items = rows.map((p) => {
          const mrp = Number(p.price);
          const existingDiscount = p.discountPercent ? Number(p.discountPercent) : 0;
          const effectiveDiscount = Math.max(existingDiscount, discountPct);
          const salePrice = Math.round(mrp * (100 - effectiveDiscount)) / 100;
          return {
            id: p.id,
            name: p.name,
            slug: (p as unknown as Record<string, unknown>)['slug'] ?? p.id,
            mrp,
            salePrice,
            discountPercent: effectiveDiscount,
            category: p.category,
            subcategory: p.subcategory,
            image: p.images[0]?.path ?? null,
            gstRate: p.gstRate !== undefined ? Number(p.gstRate) : 0.18,
          };
        });
        return {
          sale: { id: sale.id, title: sale.title, discountPercent: discountPct, endsAt: sale.endsAt },
          items,
          total,
          hasMore: total > 24,
        };
      }),
    );
  }

  async listAll() {
    return this.prisma.flashSale.findMany({ orderBy: { startsAt: 'desc' } });
  }

  async create(dto: CreateFlashSaleDto) {
    await this.assertProductsExist(dto.productIds);
    await this.assertNoProductOverlap(dto.productIds, undefined);
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
      await this.assertNoProductOverlap(dto.productIds, id);
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

  private async assertNoProductOverlap(productIds: string[], excludeSaleId: string | undefined): Promise<void> {
    if (!productIds || productIds.length === 0) return;
    const unique = [...new Set(productIds)];
    const now = new Date();
    // Find other active/upcoming sales that contain any of these product IDs
    const otherSales = await this.prisma.flashSale.findMany({
      where: {
        isActive: true,
        endsAt: { gte: now },
        ...(excludeSaleId ? { id: { not: excludeSaleId } } : {}),
      },
      select: { id: true, title: true, productIds: true },
    });
    for (const sale of otherSales) {
      const existingIds = (sale.productIds as string[]) ?? [];
      if (existingIds.length === 0) continue; // "ALL" scope — handled below
      const overlap = unique.filter((id) => existingIds.includes(id));
      if (overlap.length > 0) {
        throw new BadRequestException(
          `${overlap.length} product(s) are already in another active flash sale "${sale.title}". Remove duplicates before saving.`,
        );
      }
    }
  }
}
