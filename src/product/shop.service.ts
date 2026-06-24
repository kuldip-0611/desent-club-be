import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    // Fast path: fetch specific products by ID (used for shared wishlist, etc.)
    if (query.ids) {
      const idList = query.ids.split(',').map((s) => s.trim()).filter(Boolean);
      const rows = await this.prisma.product.findMany({
        where: { id: { in: idList }, isAvailable: true },
        include: {
          category: { select: { id: true, slug: true, name: true } },
          subcategory: { select: { slug: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          variants: true,
          productFabrics: { include: { fabric: { select: { name: true } } } },
        },
      });
      const items = await this.attachReviewStats(rows.map((row) => this.toShopProduct(row)));
      return { items, total: items.length, page: 1, limit: items.length, hasNextPage: false };
    }

    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 12)));
    const search = String(query.search ?? '').trim();
    const category = String(query.category ?? '').trim().toLowerCase();
    const subcategory = String(query.subcategory ?? '').trim().toLowerCase();
    const audience = String(query.audience ?? '').trim().toUpperCase();
    const sort = String(query.sort ?? 'featured').trim();

    // Advanced filter parsing
    const minPrice = query.minPrice !== undefined ? Number(query.minPrice) : undefined;
    const maxPrice = query.maxPrice !== undefined ? Number(query.maxPrice) : undefined;
    const colorList = query.colors ? query.colors.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean) : [];
    const sizeList = query.sizes ? query.sizes.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
    const fabricList = query.fabrics ? query.fabrics.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean) : [];
    const minRating = query.minRating !== undefined ? Number(query.minRating) : undefined;

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
              { color: { contains: search } },
              { fabric: { contains: search } },
            ],
          }
        : {}),
      // Price range
      ...(minPrice !== undefined ? { price: { gte: minPrice } } : {}),
      ...(maxPrice !== undefined ? { price: { ...(minPrice !== undefined ? { gte: minPrice } : {}), lte: maxPrice } } : {}),
      // Color filter (variant color)
      ...(colorList.length > 0
        ? { variants: { some: { color: { in: colorList } } } }
        : {}),
      // Size filter (variant size)
      ...(sizeList.length > 0
        ? { variants: { some: { size: { in: sizeList } } } }
        : {}),
      // Fabric filter
      ...(fabricList.length > 0
        ? {
            productFabrics: {
              some: { fabric: { name: { in: fabricList.map((f) => f.charAt(0).toUpperCase() + f.slice(1)) } } },
            },
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
          productFabrics: { include: { fabric: { select: { name: true } } } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    let items = await this.attachReviewStats(rows.map((row) => this.toShopProduct(row)));

    // Post-filter by rating (done in-memory since rating is computed)
    if (minRating !== undefined && minRating > 0) {
      items = items.filter((p) => p.rating >= minRating);
    }

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
        productFabrics: { include: { fabric: { select: { name: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Product not found');
    const product = this.toShopProduct(row);
    const reviewStats = await this.prisma.productReview.aggregate({
      where: { productId: row.id, status: 'APPROVED' },
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
    const where = { productId: product.id, status: 'APPROVED' as const };
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
    const now = new Date();

    const activeBannerWhere = (position: string) => ({
      isActive: true,
      position,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    });

    const [allCategories, featured, newest, bestSellers, heroBanners, midBanners, footerBanners] =
      await Promise.all([
        this.listCategories(),
        this.listProducts({ page: 1, limit: 8, sort: 'featured' }),
        this.listProducts({ page: 1, limit: 8, sort: 'newest' }),
        this.listProducts({ page: 1, limit: 8, sort: 'price-high' }),
        this.prisma.banner.findMany({ where: activeBannerWhere('hero'), orderBy: { sortOrder: 'asc' } }),
        this.prisma.banner.findMany({ where: activeBannerWhere('mid'), orderBy: { sortOrder: 'asc' } }),
        this.prisma.banner.findMany({ where: activeBannerWhere('footer'), orderBy: { sortOrder: 'asc' } }),
      ]);

    const categories = allCategories
      .filter((category) => category.productCount > 0)
      .sort((a, b) => b.productCount - a.productCount);

    const mapBanner = (b: { title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null }) => ({
      title: b.title,
      subtitle: b.subtitle ?? '',
      image: b.imageUrl,
      href: b.linkUrl ?? '/products',
    });

    // Fall back to category images only for hero if no CMS hero banners
    const heroBannersOut =
      heroBanners.length > 0
        ? heroBanners.map(mapBanner)
        : categories
            .filter((c) => Boolean(c.image))
            .slice(0, 4)
            .map((c) => ({
              title: c.name,
              subtitle: 'Premium essentials curated from live catalog',
              image: c.image,
              href: `/products?category=${c.slug}`,
            }));

    return {
      banners: heroBannersOut,
      midBanners: midBanners.map(mapBanner),
      footerBanners: footerBanners.map(mapBanner),
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
    productFabrics?: { fabric: { name: string }; percent?: number | null }[];
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
      materials: (row.productFabrics ?? []).map((pf) => ({
        name: pf.fabric.name,
        percent: pf.percent ?? undefined,
      })),
    };
  }

  /** Returns the size guide table for a product (variants × measurement attributes) */
  async getSizeChart(slug: string) {
    const id = slug.includes('--') ? slug.split('--').pop() ?? '' : slug;
    const product = await this.prisma.product.findFirst({
      where: { id, isAvailable: true },
      include: {
        variants: {
          include: {
            catalogSize: {
              include: {
                measurementValues: {
                  include: { attribute: { select: { slug: true, label: true, unit: true, sortOrder: true } } },
                },
              },
            },
          },
        },
        productMeasurementAttributes: {
          orderBy: { sortOrder: 'asc' },
          include: { attribute: { select: { slug: true, label: true, unit: true } } },
        },
      },
    });

    if (!product) return { attributes: [], rows: [] };

    const attrOrder = product.productMeasurementAttributes.map((pa) => pa.attribute);

    const uniqueSizes = new Map<string, typeof product.variants[0]['catalogSize']>();
    for (const v of product.variants) {
      if (v.size && !uniqueSizes.has(v.size)) {
        uniqueSizes.set(v.size, v.catalogSize);
      }
    }

    const rows = [...uniqueSizes.entries()].map(([size, catalogSize]) => {
      const values: Record<string, string> = {};
      for (const mv of catalogSize?.measurementValues ?? []) {
        values[mv.attribute.slug] = mv.value;
      }
      return { size, values };
    });

    return {
      attributes: attrOrder,
      rows,
    };
  }

  /** Returns available filter options for the current catalog (colors, sizes, fabrics, price range) */
  async getFilterOptions() {
    const [colors, sizes, fabrics, priceRange] = await Promise.all([
      this.prisma.productVariant.findMany({
        distinct: ['color'],
        where: { color: { not: '' }, product: { isAvailable: true } },
        select: { color: true },
        orderBy: { color: 'asc' },
      }),
      this.prisma.productVariant.findMany({
        distinct: ['size'],
        where: { product: { isAvailable: true } },
        select: { size: true },
        orderBy: { size: 'asc' },
      }),
      this.prisma.fabric.findMany({
        where: { isActive: true },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.aggregate({
        where: { isAvailable: true },
        _min: { price: true },
        _max: { price: true },
      }),
    ]);

    return {
      colors: colors.map((c) => c.color).filter(Boolean),
      sizes: sizes.map((s) => s.size).filter(Boolean),
      fabrics: fabrics.map((f) => ({ id: f.id, name: f.name, slug: f.slug })),
      priceRange: {
        min: Number(priceRange._min.price ?? 0),
        max: Number(priceRange._max.price ?? 10000),
      },
    };
  }

  /** Returns product slugs + category slugs for sitemap generation */
  async getSitemapData() {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { isAvailable: true },
        select: { id: true, name: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.productCategory.findMany({
        where: { isActive: true },
        select: { slug: true },
      }),
    ]);

    return {
      products: products.map((p) => ({
        slug: `${slugify(p.name)}--${p.id}`,
        updatedAt: p.updatedAt.toISOString(),
      })),
      categories: categories.map((c) => ({ slug: mapCategorySlug(c.slug) })),
    };
  }

  async submitReview(
    slug: string,
    userId: string,
    body: { rating: number; comment?: string; orderItemId: string },
  ) {
    const id = slug.includes('--') ? slug.split('--').pop() ?? '' : slug;
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');

    if (body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Rating must be between 1 and 5');
    }

    // Verify order item belongs to user and order is DELIVERED
    const orderItem = await this.prisma.orderItem.findFirst({
      where: { id: body.orderItemId, productId: product.id, order: { userId, status: 'DELIVERED' } },
      include: { order: { select: { id: true, status: true } } },
    });
    if (!orderItem) {
      throw new BadRequestException('You can only review items from delivered orders');
    }

    const existing = await this.prisma.productReview.findUnique({
      where: { userId_orderItemId: { userId, orderItemId: body.orderItemId } },
    });
    if (existing) throw new BadRequestException('You have already reviewed this item');

    const review = await this.prisma.productReview.create({
      data: {
        userId,
        productId: product.id,
        orderId: orderItem.order.id,
        orderItemId: body.orderItemId,
        rating: body.rating,
        comment: body.comment,
        status: 'PENDING',
      },
    });
    return { id: review.id, status: review.status };
  }

  async adminListReviews(
    status?: 'PENDING' | 'APPROVED' | 'REJECTED',
    page = 1,
    limit = 20,
  ) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.productReview.count({ where }),
    ]);
    return {
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        status: r.status,
        createdAt: r.createdAt,
        user: r.user,
        product: r.product,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async adminUpdateReview(id: string, status: 'APPROVED' | 'REJECTED') {
    const review = await this.prisma.productReview.findUnique({ where: { id } });
    if (!review) throw new NotFoundException('Review not found');
    return this.prisma.productReview.update({ where: { id }, data: { status } });
  }

  private async attachReviewStats<T extends { id: string; rating: number; reviewsCount: number }>(
    products: T[],
  ): Promise<T[]> {
    if (!products.length) return products;
    const stats = await this.prisma.productReview.groupBy({
      by: ['productId'],
      where: { productId: { in: products.map((p) => p.id) }, status: 'APPROVED' },
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
