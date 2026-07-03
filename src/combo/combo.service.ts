import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ComboItemDto {
  productId: string;
  variantId?: string | null;
  quantity?: number;
}

export interface CreateComboDto {
  name: string;
  slug?: string;
  description?: string;
  price: number;
  image?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  items: ComboItemDto[];
}

export interface UpdateComboDto {
  name?: string;
  slug?: string;
  description?: string;
  price?: number;
  image?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  items?: ComboItemDto[];
}

const comboItemSelect = {
  id: true,
  productId: true,
  variantId: true,
  quantity: true,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      discountPercent: true,
      images: { take: 1, orderBy: { sortOrder: 'asc' as const }, select: { path: true } },
    },
  },
  variant: {
    select: { id: true, size: true, color: true, quantity: true },
  },
};

const comboSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  image: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
  items: { select: comboItemSelect },
};

@Injectable()
export class ComboService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    const now = new Date();
    return this.prisma.combo.findMany({
      where: {
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      select: comboSelect,
    });
  }

  async getBySlug(slug: string) {
    const now = new Date();
    const combo = await this.prisma.combo.findFirst({
      where: {
        slug,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
      select: comboSelect,
    });
    if (!combo) throw new NotFoundException('Combo not found');
    return combo;
  }

  async listAll() {
    return this.prisma.combo.findMany({
      orderBy: { createdAt: 'desc' },
      select: comboSelect,
    });
  }

  async getOne(id: string) {
    const combo = await this.prisma.combo.findUnique({ where: { id }, select: comboSelect });
    if (!combo) throw new NotFoundException('Combo not found');
    return combo;
  }

  async create(dto: CreateComboDto) {
    if (!dto.items?.length || dto.items.length < 2) {
      throw new BadRequestException('A combo must have at least 2 items');
    }
    const slug = dto.slug?.trim() || this.toSlug(dto.name);
    await this.assertSlugUnique(slug);
    await this.assertItemsExist(dto.items);

    return this.prisma.combo.create({
      data: {
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() ?? null,
        price: new Prisma.Decimal(dto.price),
        image: dto.image ?? null,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            quantity: item.quantity ?? 1,
          })),
        },
      },
      select: comboSelect,
    });
  }

  async update(id: string, dto: UpdateComboDto) {
    await this.findOrFail(id);

    const data: Prisma.ComboUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.slug !== undefined) {
      const slug = dto.slug.trim() || this.toSlug(dto.name ?? '');
      await this.assertSlugUnique(slug, id);
      data.slug = slug;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() ?? null;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.image !== undefined) data.image = dto.image;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;

    if (dto.items !== undefined) {
      if (dto.items.length < 2) throw new BadRequestException('A combo must have at least 2 items');
      await this.assertItemsExist(dto.items);
      await this.prisma.comboItem.deleteMany({ where: { comboId: id } });
      data.items = {
        create: dto.items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? null,
          quantity: item.quantity ?? 1,
        })),
      };
    }

    return this.prisma.combo.update({ where: { id }, data, select: comboSelect });
  }

  async remove(id: string) {
    await this.findOrFail(id);
    await this.prisma.combo.delete({ where: { id } });
    return { message: 'Combo deleted' };
  }

  /** Fetch a combo with full item details for order processing */
  async getComboForOrder(comboId: string) {
    return this.prisma.combo.findUnique({
      where: { id: comboId },
      select: {
        id: true,
        name: true,
        price: true,
        items: {
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            product: { select: { name: true, quantity: true } },
            variant: { select: { size: true, color: true, quantity: true } },
          },
        },
      },
    });
  }

  private async findOrFail(id: string) {
    const combo = await this.prisma.combo.findUnique({ where: { id } });
    if (!combo) throw new NotFoundException('Combo not found');
    return combo;
  }

  private async assertSlugUnique(slug: string, excludeId?: string) {
    const existing = await this.prisma.combo.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException(`Slug "${slug}" is already taken`);
    }
  }

  private async assertItemsExist(items: ComboItemDto[]) {
    const productIds = [...new Set(items.map((i) => i.productId))];
    const found = await this.prisma.product.count({ where: { id: { in: productIds } } });
    if (found !== productIds.length) {
      throw new BadRequestException('One or more product IDs do not exist');
    }
    const variantIds = items.map((i) => i.variantId).filter((v): v is string => !!v);
    if (variantIds.length) {
      const vFound = await this.prisma.productVariant.count({ where: { id: { in: variantIds } } });
      if (vFound !== variantIds.length) {
        throw new BadRequestException('One or more variant IDs do not exist');
      }
    }
  }

  private toSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }
}
