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
        subcategories: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            slug: true,
            image: true,
            _count: { select: { products: { where: { isAvailable: true } } } },
          },
        },
      },
    });

    return rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: mapCategorySlug(row.slug),
        image: row.image,
        productCount: row._count.products,
        subcategories: row.subcategories
          .filter((s) => s._count.products > 0)
          .map((s) => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            image: s.image,
            productCount: s._count.products,
          })),
      }))
      .filter((row) => row.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name));
  }

  async listProducts(query: ListShopProductsQueryDto = {}) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 12)));
    const search = String(query.search ?? '').trim();
    const category = String(query.category ?? '').trim().toLowerCase();
    const subcategory = String(query.subcategory ?? '').trim().toLowerCase();
    const audience = String(query.audience ?? '').trim().toUpperCase();
    const sort = String(query.sort ?? 'featured').trim();

    const audienceFilter: ProductAudience | undefined =
      audience === 'MEN' || audience === 'WOMEN' || audience === 'UNISEX'
        ? (audience as ProductAudience)
        : undefined;

    const categorySlugFilter =
      category && category !== 'all'
        ? {
            OR: [
              { slug: category },
              { slug: category.replace(/s$/, '') },
            ],
          }
        : undefined;

    const where: Prisma.ProductWhereInput = {
      isAvailable: true,
      category: {
        isNot: null,
        is: {
          isActive: true,
          ...(categorySlugFilter ?? {}),
        },
      },
      ...(subcategory && categorySlugFilter
        ? {
            subcategory: {
              is: {
                slug: subcategory,
                isActive: true,
                category: {
                  is: {
                    isActive: true,
                    ...categorySlugFilter,
                  },
                },
              },
            },
          }
        : {}),
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
          category: { select: { id: true, slug: true, name: true } },
          subcategory: { select: { slug: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          variants: true,
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const items = await this.attachReviewStats(rows.map((row) => this.toShopProduct(row)));
    return {
      items,
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
        category: { select: { id: true, slug: true, name: true } },
        subcategory: { select: { slug: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
    });
    if (!row) throw new NotFoundException('Product not found');
    const product = this.toShopProduct(row);
    const reviewStats = await this.prisma.productReview.aggregate({
      where: { productId: row.id },
      _avg: { rating: true },
      _count: { rating: true },
    });
    product.rating = reviewStats._count.rating
      ? Number((reviewStats._avg.rating ?? 0).toFixed(1))
      : 0;
    product.reviewsCount = reviewStats._count.rating;
    return product;
  }

  async getProductReviews(slug: string, page = 1, limit = 10) {
    const id = slug.includes('--') ? slug.split('--').pop() ?? '' : slug;
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    const skip = (page - 1) * limit;
    const where = { productId: product.id };
    const [items, total, aggregate] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: { name: r.user.name },
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 0,
      reviewsCount: aggregate._count.rating,
    };
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
        category: { select: { id: true, slug: true, name: true } },
        subcategory: { select: { slug: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 4,
    });
    const products = rows.map((row) => this.toShopProduct(row));
    return this.attachReviewStats(products);
  }

  /**
   * Lightweight search for navbar autocomplete.
   * Returns up to `limit` matching products — just the fields needed to render suggestions.
   */
  async searchSuggestions(query: string, limit = 8) {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    const rows = await this.prisma.product.findMany({
      where: {
        isAvailable: true,
        category: { isNot: null, is: { isActive: true } },
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { category: { is: { name: { contains: q } } } },
        ],
      },
      include: {
        category: { select: { slug: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row) => {
      const basePrice = Number(row.price);
      const compareAtPrice =
        row.discountPercent && row.discountPercent >= 1
          ? Math.round((basePrice * 100) / (100 - row.discountPercent))
          : undefined;
      return {
        id: row.id,
        slug: `${slugify(row.name)}--${row.id}`,
        name: row.name,
        price: basePrice,
        compareAtPrice,
        image: row.images[0]?.path ?? null,
        category: row.category
          ? { slug: mapCategorySlug(row.category.slug), name: row.category.name }
          : null,
      };
    });
  }

  async getHomeData() {
    const [allCategories, featured, newest, bestSellers] = await Promise.all([
      this.listCategories(),
      this.listProducts({ page: 1, limit: 8, sort: 'featured' }),
      this.listProducts({ page: 1, limit: 8, sort: 'newest' }),
      this.listProducts({ page: 1, limit: 8, sort: 'price-high' }),
    ]);
    const categories = allCategories
      .filter((category) => category.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount);
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
    category: { id: string; slug: string; name: string } | null;
    subcategory: { slug: string; name: string } | null;
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

    const subSlug = row.subcategory?.slug
      ? String(row.subcategory.slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : '';

    return {
      id: row.id,
      slug: productSlug,
      name: row.name,
      description: row.description ?? '',
      category: row.category
        ? {
            id: row.category.id,
            slug: mapCategorySlug(row.category.slug),
            name: row.category.name,
          }
        : { id: '', slug: 'tshirts', name: 'Tshirts' },
      subcategory: row.subcategory && subSlug
        ? { slug: subSlug, name: row.subcategory.name }
        : null,
      audience: row.audience,
      price: basePrice,
      compareAtPrice,
      rating: 0,
      reviewsCount: 0,
      tags: ['premium', 'live-catalog'],
      images,
      imagesByColor,
      variants: variants.length ? variants : [{ id: `${row.id}-v1`, size: 'M', colorName: 'Default', colorHex: '#111827', stock: 0 }],
      isNewArrival: true,
      isBestSeller: true,
    };
  }

  private async attachReviewStats<T extends { id: string; rating: number; reviewsCount: number }>(
    products: T[],
  ): Promise<T[]> {
    if (!products.length) return products;
    const stats = await this.prisma.productReview.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p) => p.id) } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const byProduct = new Map(stats.map((row) => [row.productId, row]));
    return products.map((product) => {
      const row = byProduct.get(product.id);
      if (!row || row._count.rating === 0) {
        return { ...product, rating: 0, reviewsCount: 0 };
      }
      return {
        ...product,
        rating: Number((row._avg.rating ?? 0).toFixed(1)),
        reviewsCount: row._count.rating,
      };
    });
  }
}
