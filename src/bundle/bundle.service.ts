import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateBundleDto {
  name: string;
  description?: string;
  discountType?: 'PERCENT' | 'FLAT';
  discountValue: number;
  minItems?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
  productIds: string[];
}

export interface UpdateBundleDto {
  name?: string;
  description?: string;
  discountType?: 'PERCENT' | 'FLAT';
  discountValue?: number;
  minItems?: number;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  productIds?: string[];
}

const bundleProductSelect = {
  id: true,
  productId: true,
  product: {
    select: {
      id: true,
      name: true,
      price: true,
      discountPercent: true,
      images: { take: 1, select: { path: true } },
    },
  },
};

@Injectable()
export class BundleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public: active bundles with product details */
  async listActive() {
    const now = new Date();
    return this.prisma.bundle.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      include: { products: { select: bundleProductSelect } },
    });
  }

  /** Admin: all bundles */
  async listAll() {
    return this.prisma.bundle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { products: { select: bundleProductSelect } },
    });
  }

  async create(dto: CreateBundleDto) {
    const bundle = await this.prisma.bundle.create({
      data: {
        name: dto.name,
        description: dto.description,
        discountType: dto.discountType ?? 'PERCENT',
        discountValue: new Prisma.Decimal(dto.discountValue),
        minItems: dto.minItems ?? 2,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        products: {
          create: dto.productIds.map((productId) => ({ productId })),
        },
      },
      include: { products: { select: bundleProductSelect } },
    });
    return bundle;
  }

  async update(id: string, dto: UpdateBundleDto) {
    await this.findOrFail(id);

    const data: Prisma.BundleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.discountType !== undefined) data.discountType = dto.discountType;
    if (dto.discountValue !== undefined)
      data.discountValue = new Prisma.Decimal(dto.discountValue);
    if (dto.minItems !== undefined) data.minItems = dto.minItems;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.startsAt !== undefined)
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined)
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    // Replace products if provided
    if (dto.productIds !== undefined) {
      await this.prisma.bundleProduct.deleteMany({ where: { bundleId: id } });
      data.products = {
        create: dto.productIds.map((productId) => ({ productId })),
      };
    }

    return this.prisma.bundle.update({
      where: { id },
      data,
      include: { products: { select: bundleProductSelect } },
    });
  }

  async remove(id: string) {
    await this.findOrFail(id);
    await this.prisma.bundle.delete({ where: { id } });
    return { message: 'Bundle deleted' };
  }

  /**
   * Given a list of product IDs in the cart, returns the best matching
   * active bundle discount (if any products overlap with a bundle).
   */
  async checkCartBundle(productIds: string[]): Promise<{
    bundleId: string | null;
    bundleName: string | null;
    discountType: string | null;
    discountValue: number | null;
    matchedProductIds: string[];
  }> {
    if (!productIds.length) {
      return { bundleId: null, bundleName: null, discountType: null, discountValue: null, matchedProductIds: [] };
    }

    const now = new Date();
    const bundles = await this.prisma.bundle.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      include: { products: { select: { productId: true } } },
    });

    const cartSet = new Set(productIds);
    let bestBundle: (typeof bundles)[0] | null = null;
    let bestMatchCount = 0;

    for (const bundle of bundles) {
      const bundleProductIds = bundle.products.map((p) => p.productId);
      const matched = bundleProductIds.filter((pid) => cartSet.has(pid));
      if (matched.length >= bundle.minItems && matched.length > bestMatchCount) {
        bestBundle = bundle;
        bestMatchCount = matched.length;
      }
    }

    if (!bestBundle) {
      return { bundleId: null, bundleName: null, discountType: null, discountValue: null, matchedProductIds: [] };
    }

    const matchedProductIds = bestBundle.products
      .map((p) => p.productId)
      .filter((pid) => cartSet.has(pid));

    return {
      bundleId: bestBundle.id,
      bundleName: bestBundle.name,
      discountType: bestBundle.discountType,
      discountValue: Number(bestBundle.discountValue),
      matchedProductIds,
    };
  }

  private async findOrFail(id: string) {
    const bundle = await this.prisma.bundle.findUnique({ where: { id } });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }
}
