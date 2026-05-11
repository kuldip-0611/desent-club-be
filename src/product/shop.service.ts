import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductAudience } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListShopProductsQueryDto } from './dto/list-shop-products-query.dto';

type ShopVariant = {
  id: string;
  size: 'S' | 'M' | 'L' | 'XL';
  colorName: string;
  colorHex: string;
  stock: number;
};

const COLOR_HEX_BY_NAME: Record<string, string> = {
  black: '#111827',
  white: '#f8fafc',
  navy: '#1e3a8a',
  charcoal: '#334155',
  olive: '#4d7c0f',
  maroon: '#7f1d1d',
  'sky blue': '#0284c7',
  beige: '#d6d3d1',
  lavender: '#8b5cf6',
  mint: '#10b981',
  mustard: '#ca8a04',
  coral: '#f97316',
};

const mapCategorySlug = (slug: string): string => {
  const normalized = String(slug ?? '').toLowerCase();
  if (normalized === 'tshirt' || normalized === 't-shirts') return 'tshirts';
  return normalized;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

@Injectable()
export class ShopService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    const rows = await this.prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        image: true,
        _count: { select: { products: { where: { isAvailable: true } } } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: mapCategorySlug(row.slug),
      image: row.image,
      productCount: row._count.products,
    }));
  }

  async listProducts(query: ListShopProductsQueryDto = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 12)));
    const search = String(query.search ?? '').trim();
    const category = String(query.category ?? '').trim().toLowerCase();
    const audience = String(query.audience ?? '').trim().toUpperCase();
    const sort = String(query.sort ?? 'featured').trim();

    const audienceFilter: ProductAudience | undefined =
      audience === 'MEN' || audience === 'WOMEN' || audience === 'UNISEX'
        ? (audience as ProductAudience)
        : undefined;

    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      category: {
        isNot: null,
        is: {
          isActive: true,
          ...(category && category !== 'all'
            ? {
                OR: [
                  { slug: category },
                  { slug: category.replace(/s$/, '') },
                ],
              }
            : {}),
        },
      },
      ...(audienceFilter ? { audience: audienceFilter } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    };

    const orderBy =
      sort === 'price-low'
        ? ({ price: 'asc' } as const)
        : sort === 'price-high'
          ? ({ price: 'desc' } as const)
          : ({ createdAt: 'desc' } as const);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          category: { select: { slug: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          variants: true,
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toShopProduct(row)),
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
    };
  }

  async getProductBySlug(slug: string) {
    const id = slug.includes('--') ? slug.split('--').pop() ?? '' : slug;
    const row = await this.prisma.product.findFirst({
      where: {
        id,
        isAvailable: true,
        category: { isNot: null, is: { isActive: true } },
      },
      include: {
        category: { select: { slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
    if (!row) throw new NotFoundException('Product not found');
    return this.toShopProduct(row);
  }

  async listRelatedProducts(slug: string) {
    const id = slug.includes('--') ? slug.split('--').pop() ?? '' : slug;
    const source = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, categoryId: true },
    });
    if (!source?.categoryId) return [];
    const rows = await this.prisma.product.findMany({
      where: {
        id: { not: source.id },
        categoryId: source.categoryId,
        isAvailable: true,
        category: { isNot: null, is: { isActive: true } },
      },
      include: {
        category: { select: { slug: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    return rows.map((row) => this.toShopProduct(row));
  }

  async getHomeData() {
    const [categories, featured, newest, bestSellers] = await Promise.all([
      this.listCategories(),
      this.listProducts({ page: 1, limit: 8, sort: 'featured' }),
      this.listProducts({ page: 1, limit: 8, sort: 'newest' }),
      this.listProducts({ page: 1, limit: 8, sort: 'price-high' }),
    ]);
    const banners = categories
      .filter((category) => Boolean(category.image))
      .slice(0, 4)
      .map((category) => ({
        title: category.name,
        subtitle: 'Premium essentials curated from live catalog',
        image: category.image,
        href: `/products?category=${category.slug}`,
      }));

    return {
      banners,
      categories,
      featured: featured.items,
      newest: newest.items,
      bestSellers: bestSellers.items,
    };
  }

  private toShopProduct(row: {
    id: string;
    name: string;
    description: string | null;
    price: unknown;
    discountPercent: number | null;
    audience: 'MEN' | 'WOMEN' | 'UNISEX';
    category: { slug: string } | null;
    images: { path: string; color: string }[];
    variants: { id: string; size: string; color: string; quantity: number }[];
    createdAt: Date;
  }) {
    const basePrice = Number(row.price);
    const compareAtPrice =
      row.discountPercent && row.discountPercent >= 1
        ? Math.round((basePrice * 100) / (100 - row.discountPercent))
        : undefined;
    const productSlug = `${slugify(row.name)}--${row.id}`;
    const images = row.images.map((image) => image.path);
    const imagesByColor = row.images.reduce(
      (acc, image) => {
        const key = String(image.color ?? '').trim().toLowerCase();
        if (!key) return acc;
        if (!acc[key]) acc[key] = [];
        acc[key].push(image.path);
        return acc;
      },
      {} as Record<string, string[]>,
    );
    const variants: ShopVariant[] = row.variants.map((variant) => {
      const colorName = String(variant.color ?? '').trim() || 'Default';
      return {
        id: variant.id,
        size: (variant.size || 'M') as ShopVariant['size'],
        colorName,
        colorHex: COLOR_HEX_BY_NAME[colorName.toLowerCase()] ?? '#111827',
        stock: variant.quantity,
      };
    });

    const ratingSeed = row.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const rating = Number((4 + (ratingSeed % 10) / 20).toFixed(1));
    const reviewsCount = 40 + (ratingSeed % 180);

    return {
      id: row.id,
      slug: productSlug,
      name: row.name,
      description: row.description ?? '',
      category: mapCategorySlug(row.category?.slug ?? 'tshirts'),
      audience: row.audience,
      price: basePrice,
      compareAtPrice,
      rating,
      reviewsCount,
      tags: ['premium', 'live-catalog'],
      images,
      imagesByColor,
      variants: variants.length ? variants : [{ id: `${row.id}-v1`, size: 'M', colorName: 'Default', colorHex: '#111827', stock: 0 }],
      isNewArrival: true,
      isBestSeller: true,
    };
  }
}
