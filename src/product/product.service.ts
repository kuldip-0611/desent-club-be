import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MeasurementAttribute,
  Prisma,
  Product,
  ProductFabric,
  ProductImage,
  ProductVariant,
  Size,
  SizeMeasurementValue,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { BackInStockService } from '../back-in-stock/back-in-stock.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const variantAdminInclude = {
  catalogSize: {
    include: {
      measurementValues: {
        include: { attribute: true },
      },
    },
  },
} satisfies Prisma.ProductVariantInclude;

export type ProductImageResponse = ProductImage;

export type CatalogSizeMeasurements = Size & {
  measurementValues: (SizeMeasurementValue & {
    attribute: MeasurementAttribute;
  })[];
};

export type ProductVariantResponse = Pick<
  ProductVariant,
  'id' | 'productId' | 'size' | 'color' | 'sizeId' | 'quantity' | 'createdAt' | 'updatedAt'
> & {
  catalogSize: CatalogSizeMeasurements | null;
};

export type ProductCategorySummary = {
  id: string;
  name: string;
  slug: string;
};

export type ProductCategorySubcategorySummary = {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
};

export type FabricSummary = {
  id: string;
  name: string;
  slug: string;
};

export type ProductFabricResponse = Pick<
  ProductFabric,
  'id' | 'productId' | 'fabricId' | 'percent'
> & {
  fabric: FabricSummary;
};

export type ProductMeasurementAttributeSummary = {
  id: string;
  slug: string;
  label: string;
  unit: string | null;
  sortOrder: number;
};

export type ProductResponse = Omit<Product, 'price' | 'category' | 'subcategory'> & {
  /** List price before discount */
  price: number;
  /** Amount after `discountPercent` is applied; equals `price` when there is no discount */
  salePrice: number;
  category: ProductCategorySummary | null;
  subcategory: ProductCategorySubcategorySummary | null;
  productFabrics: ProductFabricResponse[];
  /** Measurements that apply to this product’s size chart (chest, shoulder, …). Empty = custom sizes OK. */
  measurementAttributes: ProductMeasurementAttributeSummary[];
  images: ProductImageResponse[];
  variants: ProductVariantResponse[];
};

export type PaginatedProductsResponse = {
  items: ProductResponse[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  summary: {
    total: number;
    available: number;
    lowStock: number;
  };
};

const categorySelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const fabricCatalogSelect = {
  id: true,
  name: true,
  slug: true,
} as const;

const measurementAttributePublicSelect = {
  id: true,
  slug: true,
  label: true,
  unit: true,
  sortOrder: true,
} as const;

const subcategoryAdminSelect = {
  id: true,
  name: true,
  slug: true,
  categoryId: true,
} as const;

const adminProductInclude = {
  category: { select: categorySelect },
  subcategory: { select: subcategoryAdminSelect },
  productFabrics: {
    orderBy: [{ fabric: { name: 'asc' as const } }, { id: 'asc' as const }],
    include: { fabric: { select: fabricCatalogSelect } },
  },
  productMeasurementAttributes: {
    orderBy: { sortOrder: 'asc' as const },
    include: { attribute: { select: measurementAttributePublicSelect } },
  },
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: {
    orderBy: { size: 'asc' as const },
    include: variantAdminInclude,
  },
} satisfies Prisma.ProductInclude;

type ProductAdminRow = Prisma.ProductGetPayload<{
  include: typeof adminProductInclude;
}>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type VariantRowInput = {
  size: string;
  color: string;
  quantity: number;
  sizeId: string | null;
};

type FabricRowInput = {
  fabricId: string;
  percent: number;
};

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => BackInStockService))
    private readonly backInStockService: BackInStockService,
    private readonly storage: StorageService,
  ) {}

  async findAllForAdmin(
    query: ListProductsQueryDto = {},
  ): Promise<PaginatedProductsResponse> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const search = String(query.search ?? '').trim();
    const searchWhere: Prisma.ProductWhereInput = search
      ? {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
            { color: { contains: search } },
            { fabric: { contains: search } },
            { category: { is: { name: { contains: search } } } },
          ],
        }
      : {};

    const stockWhere: Prisma.ProductWhereInput =
      query.stockStatus === 'OUT_OF_STOCK'
        ? { quantity: 0 }
        : query.stockStatus === 'LOW_STOCK'
        ? { quantity: { gt: 0, lte: 5 } }
        : query.stockStatus === 'IN_STOCK'
        ? { quantity: { gt: 5 } }
        : {};

    const where: Prisma.ProductWhereInput = { AND: [searchWhere, stockWhere] };

    const [rows, total, available, lowStock] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: adminProductInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.count({ where: { ...where, isAvailable: true } }),
      this.prisma.product.count({ where: { ...where, quantity: { lte: 5 } } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items: rows.map((p) => this.toResponse(p)),
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      summary: {
        total,
        available,
        lowStock,
      },
    };
  }

  async findOne(id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: adminProductInclude,
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.toResponse(product);
  }

  async create(
    dto: CreateProductDto,
    files: Express.Multer.File[],
  ): Promise<ProductResponse> {
    const mergedVariants = this.parseVariantsJson(dto.variants);
    const resolvedVariants =
      mergedVariants.length > 0
        ? await this.resolveVariantRows(mergedVariants)
        : [];
    const totalQuantity = resolvedVariants.length
      ? resolvedVariants.reduce((a, r) => a + r.quantity, 0)
      : dto.quantity;

    const categoryIdNormalized = dto.categoryId?.trim();
    if (!categoryIdNormalized) {
      throw new BadRequestException('Category is required');
    }
    await this.assertCategoryExists(categoryIdNormalized);
    let subcategoryIdForCreate: string | null = null;
    if (dto.subcategoryId?.trim()) {
      subcategoryIdForCreate = dto.subcategoryId.trim();
      await this.assertSubcategoryMatchesCategory(categoryIdNormalized, subcategoryIdForCreate);
    }

    const fabricRows = await this.parseAndValidateFabrics(dto.fabrics);
    const measurementAttrIds = this.parseMeasurementAttributeIdsJson(dto.measurementAttributeIds);
    await this.assertActiveMeasurementAttributesExist(measurementAttrIds);
    if (measurementAttrIds.length > 0 && resolvedVariants.length === 0) {
      throw new BadRequestException(
        'Products with size-chart measurements need at least one size row linked to catalog sizes.',
      );
    }
    await this.assertVariantsMatchMeasurements(measurementAttrIds, resolvedVariants);

    // Upload images to S3 (parallel)
    const uploadedImages = files && files.length > 0
      ? await Promise.all(
          files.map(async (file, index) => {
            const result = await this.storage.upload(file, 'products');
            return { path: result.url, sortOrder: index, color: '' };
          }),
        )
      : [];
    const images = uploadedImages;
    const imageColors = this.parseImageColorsJson(dto.imageColors, images.length);

    // Generate unique slug from name
    const baseSlug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = baseSlug;
    let slugCounter = 0;
    while (await this.prisma.product.findUnique({ where: { slug } })) {
      slugCounter++;
      slug = `${baseSlug}-${slugCounter}`;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Insert product row first; nested variant create can hit a Prisma/MySQL edge case.
      const product = await tx.product.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          price: new Prisma.Decimal(dto.price),
          quantity: totalQuantity,
          audience: dto.audience ?? undefined,
          color: this.resolveColorInput(dto),
          fabric: '',
          discountPercent: dto.discountPercent ?? null,
          categoryId: categoryIdNormalized,
          subcategoryId: subcategoryIdForCreate,
          isAvailable: dto.isAvailable,
          slug,
        },
      });

      if (images.length > 0) {
        await tx.productImage.createMany({
          data: images.map((img) => ({
            productId: product.id,
            path: img.path,
            sortOrder: img.sortOrder,
            color: imageColors[img.sortOrder] ?? '',
          })),
        });
      }

      if (resolvedVariants.length > 0) {
        await this.insertVariantRows(tx, product.id, resolvedVariants);
      }

      if (fabricRows.length > 0) {
        await tx.productFabric.createMany({
          data: fabricRows.map((r) => ({
            productId: product.id,
            fabricId: r.fabricId,
            percent: r.percent,
          })),
        });
      }

      if (measurementAttrIds.length > 0) {
        await tx.productMeasurementAttribute.createMany({
          data: measurementAttrIds.map((attributeId, sortOrder) => ({
            productId: product.id,
            attributeId,
            sortOrder,
          })),
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: adminProductInclude,
      });
    });

    return this.toResponse(created);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    await this.ensureProductExists(id);
    const beforeCats = await this.prisma.product.findUniqueOrThrow({
      where: { id },
      select: { categoryId: true, subcategoryId: true, quantity: true },
    });
    const previousQuantity = beforeCats.quantity;

    const data: Prisma.ProductUncheckedUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
      // Regenerate slug when name changes
      const baseSlug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      let slug = baseSlug;
      let slugCounter = 0;
      // Exclude the current product from uniqueness check
      while (await this.prisma.product.findFirst({ where: { slug, NOT: { id } } })) {
        slugCounter++;
        slug = `${baseSlug}-${slugCounter}`;
      }
      data.slug = slug;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = new Prisma.Decimal(dto.price);
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (
      dto.color !== undefined ||
      'colour' in (dto as unknown as Record<string, unknown>)
    ) {
      data.color = this.resolveColorInput(dto);
    }
    if (dto.discountPercent !== undefined) {
      data.discountPercent = dto.discountPercent;
    }

    let resolvedCategoryId = beforeCats.categoryId ?? null;
    if (dto.categoryId !== undefined) {
      if (dto.categoryId === null) {
        data.categoryId = null;
        resolvedCategoryId = null;
      } else {
        await this.assertCategoryExists(dto.categoryId);
        resolvedCategoryId = dto.categoryId.trim();
        data.categoryId = resolvedCategoryId;
      }
    }

    let resolvedSubcategoryId = beforeCats.subcategoryId ?? null;
    if (dto.subcategoryId !== undefined) {
      if (dto.subcategoryId === null || String(dto.subcategoryId).trim() === '') {
        data.subcategoryId = null;
        resolvedSubcategoryId = null;
      } else {
        if (!resolvedCategoryId) {
          throw new BadRequestException('Subcategory requires a category');
        }
        const sid = String(dto.subcategoryId).trim();
        await this.assertSubcategoryMatchesCategory(resolvedCategoryId, sid);
        data.subcategoryId = sid;
        resolvedSubcategoryId = sid;
      }
    } else if (resolvedCategoryId === null) {
      data.subcategoryId = null;
    } else if (
      dto.categoryId !== undefined &&
      resolvedSubcategoryId !== null &&
      dto.subcategoryId === undefined
    ) {
      const still = await this.prisma.productCategorySubcategory.findFirst({
        where: { id: resolvedSubcategoryId, categoryId: resolvedCategoryId },
        select: { id: true },
      });
      if (!still) {
        data.subcategoryId = null;
      }
    }

    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;

    if (dto.fabrics !== undefined) {
      const fabricRows = this.normalizeFabricRowsFromDto(dto.fabrics);
      await this.assertFabricRowsValid(fabricRows);
      await this.replaceProductFabrics(id, fabricRows);
      data.fabric = '';
    }

    let newMeasurementAttrIds: string[] | null = null;
    if (dto.measurementAttributeIds !== undefined) {
      newMeasurementAttrIds = this.normalizeMeasurementAttributeIdsFromDto(
        dto.measurementAttributeIds,
      );
      await this.assertActiveMeasurementAttributesExist(newMeasurementAttrIds);
      await this.replaceProductMeasurementAttributes(id, newMeasurementAttrIds);
    }

    if (dto.variants !== undefined) {
      const merged = this.mergeVariantRows(
        dto.variants.map((v) => ({
          size: v.size,
          color: v.color ?? '',
          quantity: v.quantity,
          sizeId: v.sizeId ?? null,
        })),
      );
      const resolved = await this.resolveVariantRows(merged);
      const idsForCheck =
        newMeasurementAttrIds ?? (await this.getProductMeasurementAttributeIds(id));
      await this.assertVariantsMatchMeasurements(idsForCheck, resolved);
      await this.replaceVariants(id, resolved);
      data.quantity = resolved.reduce((a, r) => a + r.quantity, 0);
    } else if (dto.quantity !== undefined) {
      const variantCount = await this.prisma.productVariant.count({
        where: { productId: id },
      });
      if (variantCount > 0) {
        if (dto.quantity !== 0) {
          throw new BadRequestException(
            'Stock is split by size — send the full `variants` array to update quantities for this product.',
          );
        }
        // quantity: 0 → zero out all variant stock
        await this.prisma.productVariant.updateMany({
          where: { productId: id },
          data: { quantity: 0 },
        });
      }
      data.quantity = dto.quantity;
    } else if (newMeasurementAttrIds !== null) {
      const rows = await this.prisma.productVariant.findMany({
        where: { productId: id },
      });
      const asInput: VariantRowInput[] = rows.map((r) => ({
        size: r.size,
        color: r.color,
        quantity: r.quantity,
        sizeId: r.sizeId,
      }));
      await this.assertVariantsMatchMeasurements(newMeasurementAttrIds, asInput);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data,
      include: adminProductInclude,
    });

    // Trigger back-in-stock notifications when quantity goes from 0 to >0
    if (previousQuantity === 0 && updated.quantity > 0) {
      this.backInStockService.notifySubscribers(id).catch(() => undefined);
    }

    return this.toResponse(updated);
  }

  async appendImages(
    productId: string,
    files: Express.Multer.File[],
    imageColorsRaw?: string,
  ): Promise<ProductResponse> {
    if (!files?.length) {
      throw new BadRequestException('At least one image is required');
    }

    await this.ensureProductExists(productId);

    const existingMax = await this.prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    const startOrder = (existingMax._max.sortOrder ?? -1) + 1;
    const imageColors = this.parseImageColorsJson(imageColorsRaw, files.length);

    // Upload all files to S3 first, then persist URLs in DB
    const uploadedPaths = await Promise.all(
      files.map((file) => this.storage.upload(file, 'products').then((r) => r.url)),
    );

    await this.prisma.$transaction(
      uploadedPaths.map((path, i) =>
        this.prisma.productImage.create({
          data: {
            productId,
            path,
            sortOrder: startOrder + i,
            color: imageColors[i] ?? '',
          },
        }),
      ),
    );

    return this.findOne(productId);
  }

  async updateImageColor(
    productId: string,
    imageId: string,
    color?: string,
  ): Promise<ProductResponse> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }
    await this.prisma.productImage.update({
      where: { id: imageId },
      data: { color: String(color ?? '').trim() },
    });
    return this.findOne(productId);
  }

  async removeImage(
    productId: string,
    imageId: string,
  ): Promise<ProductResponse> {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw new NotFoundException('Image not found');
    }

    await this.unlinkStoredFile(image.path);
    await this.prisma.productImage.delete({ where: { id: imageId } });

    return this.findOne(productId);
  }

  async reorderImages(
    productId: string,
    order: { id: string; sortOrder: number }[],
  ): Promise<{ ok: boolean }> {
    await this.prisma.$transaction(
      order.map((item) =>
        this.prisma.productImage.updateMany({
          where: { id: item.id, productId },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );
    return { ok: true };
  }

  async remove(id: string): Promise<{ message: string }> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Guard: product referenced in order items (DB has onDelete: Restrict, but this gives a clear message)
    const orderItemCount = await this.prisma.orderItem.count({
      where: { productId: id },
    });
    if (orderItemCount > 0) {
      throw new BadRequestException(
        `Cannot delete product: it appears in ${orderItemCount} order(s). Deactivate it instead to hide it from the shop.`,
      );
    }

    // Guard: product is part of a bundle - removing it silently breaks bundle minItems
    const bundleCount = await this.prisma.bundleProduct.count({
      where: { productId: id },
    });
    if (bundleCount > 0) {
      throw new BadRequestException(
        `Cannot delete product: it is included in ${bundleCount} bundle(s). Remove it from those bundles first.`,
      );
    }

    // Guard: product ID present in a flash sale's JSON productIds array
    const flashSalesWithProduct = await this.prisma.flashSale.findMany({
      where: { isActive: true },
      select: { id: true, title: true, productIds: true },
    });
    const affectedFlashSales = flashSalesWithProduct.filter((fs) => {
      const ids = fs.productIds as string[];
      return Array.isArray(ids) && ids.includes(id);
    });
    if (affectedFlashSales.length > 0) {
      const titles = affectedFlashSales.map((fs) => `"${fs.title}"`).join(', ');
      throw new BadRequestException(
        `Cannot delete product: it is part of active flash sale(s): ${titles}. Remove it from those flash sales first.`,
      );
    }

    for (const img of product.images) {
      await this.unlinkStoredFile(img.path);
    }

    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted' };
  }

  private parseVariantsJson(raw?: string): VariantRowInput[] {
    if (raw == null || String(raw).trim() === '') {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      throw new BadRequestException('variants must be valid JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('variants must be a JSON array');
    }
    const rows: VariantRowInput[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Each variant must be an object');
      }
      const rec = item as Record<string, unknown>;
      const size = String(rec.size ?? '').trim();
      const color = String(rec.color ?? '').trim();
      const quantity = Number(rec.quantity);
      const sizeIdRaw = rec.sizeId;
      let sizeId: string | null = null;
      if (sizeIdRaw != null && String(sizeIdRaw).trim() !== '') {
        const sid = String(sizeIdRaw).trim();
        if (!UUID_RE.test(sid)) {
          throw new BadRequestException('Each variant sizeId must be a valid UUID');
        }
        sizeId = sid;
      }
      if (!size) {
        throw new BadRequestException('Each variant needs a non-empty size');
      }
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new BadRequestException(
          `Invalid quantity for size "${size}" (use a whole number ≥ 0)`,
        );
      }
      rows.push({ size, color, quantity, sizeId });
    }
    return this.mergeVariantRows(rows);
  }

  private mergeVariantRows(rows: VariantRowInput[]): VariantRowInput[] {
    const map = new Map<string, VariantRowInput>();
    for (const r of rows) {
      const size = r.size.trim();
      const color = (r.color ?? '').trim();
      const sizeId = r.sizeId?.trim() ? r.sizeId.trim() : null;
      if (!size) continue;
      const key = sizeId ? `id:${sizeId}:c:${color}` : `s:${size}:c:${color}`;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { size, color, quantity: r.quantity, sizeId });
      } else {
        map.set(key, {
          size,
          color,
          quantity: prev.quantity + r.quantity,
          sizeId: prev.sizeId ?? sizeId,
        });
      }
    }
    return [...map.values()];
  }

  /** When sizeId is set, normalizes `size` to the catalog row’s code and validates the id exists. */
  private async resolveVariantRows(rows: VariantRowInput[]): Promise<VariantRowInput[]> {
    const ids = [
      ...new Set(rows.map((r) => r.sizeId).filter((x): x is string => Boolean(x))),
    ];
    if (ids.length === 0) {
      return rows;
    }
    const sizes = await this.prisma.size.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    const byId = new Map(sizes.map((s) => [s.id, s]));
    for (const id of ids) {
      if (!byId.has(id)) {
        throw new BadRequestException(`Unknown catalog size id: ${id}`);
      }
    }
    return rows.map((r) => {
      if (!r.sizeId) return r;
      const cat = byId.get(r.sizeId)!;
      return { size: cat.code, color: r.color, quantity: r.quantity, sizeId: r.sizeId };
    });
  }

  private async replaceVariants(
    productId: string,
    rows: VariantRowInput[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      await tx.productVariant.deleteMany({ where: { productId } });
      if (rows.length > 0) {
        await this.insertVariantRows(tx, productId, rows);
      }
    });
  }

  private async insertVariantRows(
    tx: Prisma.TransactionClient,
    productId: string,
    rows: VariantRowInput[],
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    const now = new Date();
    const values = rows.map((row) => {
      const id = randomUUID();
      return Prisma.sql`(${id}, ${productId}, ${row.size}, ${row.color}, ${row.sizeId}, ${row.quantity}, ${now}, ${now})`;
    });

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ProductVariant
        (id, productId, size, color, sizeId, quantity, createdAt, updatedAt)
      VALUES ${Prisma.join(values, ', ')}
    `);
  }

  private makeVariantSku(productId: string, size: string, index: number): string {
    const seed = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
    const compactProductId = productId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const compactSize = size.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8) || 'SIZE';
    return `${compactProductId}-${compactSize}-${seed}`.slice(0, 191);
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const row = await this.prisma.productCategory.findUnique({
      where: { id: categoryId.trim() },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException('Invalid product category id');
    }
  }

  private async assertSubcategoryMatchesCategory(
    categoryId: string,
    subcategoryId: string,
  ): Promise<void> {
    const row = await this.prisma.productCategorySubcategory.findFirst({
      where: { id: subcategoryId.trim(), categoryId: categoryId.trim() },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException('Subcategory does not belong to this category');
    }
  }

  private async parseAndValidateFabrics(raw?: string): Promise<FabricRowInput[]> {
    const rows = this.parseFabricsJson(raw);
    await this.assertFabricRowsValid(rows);
    return rows;
  }

  private parseFabricsJson(raw?: string): FabricRowInput[] {
    if (raw == null || String(raw).trim() === '') {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      throw new BadRequestException('fabrics must be valid JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('fabrics must be a JSON array');
    }
    const rows: FabricRowInput[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Each fabric row must be an object');
      }
      const rec = item as Record<string, unknown>;
      const fabricId = String(rec.fabricId ?? '').trim();
      const percent = Number(rec.percent);
      if (!UUID_RE.test(fabricId)) {
        throw new BadRequestException('Each fabric row needs a valid fabricId UUID');
      }
      if (seen.has(fabricId)) {
        throw new BadRequestException(
          'Duplicate fabric in blend — use one row per fabric or combine percentages',
        );
      }
      seen.add(fabricId);
      if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
        throw new BadRequestException(
          `Invalid percent for fabric row (use a whole number 1–100)`,
        );
      }
      rows.push({ fabricId, percent });
    }
    return rows;
  }

  private normalizeFabricRowsFromDto(
    rows: { fabricId: string; percent: number }[],
  ): FabricRowInput[] {
    const seen = new Set<string>();
    const out: FabricRowInput[] = [];
    for (const r of rows) {
      const fabricId = String(r.fabricId ?? '').trim();
      const percent = Math.min(100, Math.max(1, Math.floor(Number(r.percent))));
      if (!UUID_RE.test(fabricId)) {
        throw new BadRequestException('Each fabric row needs a valid fabricId UUID');
      }
      if (seen.has(fabricId)) {
        throw new BadRequestException('Duplicate fabric in blend');
      }
      seen.add(fabricId);
      out.push({ fabricId, percent });
    }
    return out;
  }

  private async assertFabricRowsValid(rows: FabricRowInput[]): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const sum = rows.reduce((a, r) => a + r.percent, 0);
    if (sum !== 100) {
      throw new BadRequestException(
        `Fabric blend must total 100% (currently ${sum}%). Adjust the percentages.`,
      );
    }
    const ids = rows.map((r) => r.fabricId);
    const found = await this.prisma.fabric.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('One or more fabric ids are invalid');
    }
  }

  private async replaceProductFabrics(
    productId: string,
    rows: FabricRowInput[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productFabric.deleteMany({ where: { productId } });
      if (rows.length > 0) {
        await tx.productFabric.createMany({
          data: rows.map((r) => ({
            productId,
            fabricId: r.fabricId,
            percent: r.percent,
          })),
        });
      }
    });
  }

  private parseMeasurementAttributeIdsJson(raw?: string): string[] {
    if (raw == null || String(raw).trim() === '') {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      throw new BadRequestException('measurementAttributeIds must be valid JSON');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('measurementAttributeIds must be a JSON array of UUID strings');
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const id = String(item ?? '').trim();
      if (!id) {
        continue;
      }
      if (!UUID_RE.test(id)) {
        throw new BadRequestException('Each measurement attribute id must be a valid UUID');
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private normalizeMeasurementAttributeIdsFromDto(ids: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
      const id = String(raw ?? '').trim();
      if (!id) {
        continue;
      }
      if (!UUID_RE.test(id)) {
        throw new BadRequestException('Each measurement attribute id must be a valid UUID');
      }
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private async assertActiveMeasurementAttributesExist(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    const rows = await this.prisma.measurementAttribute.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException(
        'One or more measurement attributes are missing or inactive. Refresh the page and choose valid attributes.',
      );
    }
  }

  private async getProductMeasurementAttributeIds(productId: string): Promise<string[]> {
    const rows = await this.prisma.productMeasurementAttribute.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
      select: { attributeId: true },
    });
    return rows.map((r) => r.attributeId);
  }

  private async assertVariantsMatchMeasurements(
    attributeIds: string[],
    variants: VariantRowInput[],
  ): Promise<void> {
    if (attributeIds.length === 0 || variants.length === 0) {
      return;
    }
    const missingCatalog = variants.filter((v) => !v.sizeId?.trim());
    if (missingCatalog.length > 0) {
      throw new BadRequestException(
        'This product uses size-chart measurements — every size row must pick a catalog size (not Custom).',
      );
    }
    const sizeIds = [...new Set(variants.map((v) => v.sizeId!).filter(Boolean))];
    const sizes = await this.prisma.size.findMany({
      where: { id: { in: sizeIds } },
      include: {
        measurementValues: {
          where: { attributeId: { in: attributeIds } },
        },
      },
    });
    const bySizeId = new Map(sizes.map((s) => [s.id, s]));
    const attrs = await this.prisma.measurementAttribute.findMany({
      where: { id: { in: attributeIds } },
      select: { id: true, label: true },
    });
    const labelById = new Map(attrs.map((a) => [a.id, a.label]));
    for (const sid of sizeIds) {
      const s = bySizeId.get(sid);
      if (!s) {
        throw new BadRequestException('One or more catalog size ids are invalid');
      }
      const byAttr = new Map(
        s.measurementValues.map((mv) => [mv.attributeId, mv.value.trim()]),
      );
      for (const aid of attributeIds) {
        const val = byAttr.get(aid);
        if (!val) {
          const label = labelById.get(aid) ?? 'measurement';
          throw new BadRequestException(
            `Catalog size "${s.code}" is missing ${label}. Edit the size under Admin → Sizes, or pick another size.`,
          );
        }
      }
    }
  }

  private async replaceProductMeasurementAttributes(
    productId: string,
    attributeIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.productMeasurementAttribute.deleteMany({ where: { productId } });
      if (attributeIds.length > 0) {
        await tx.productMeasurementAttribute.createMany({
          data: attributeIds.map((attributeId, sortOrder) => ({
            productId,
            attributeId,
            sortOrder,
          })),
        });
      }
    });
  }

  private async ensureProductExists(id: string): Promise<void> {
    const exists = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Product not found');
    }
  }

  private async unlinkStoredFile(publicPath: string): Promise<void> {
    if (!publicPath) return;
    // Delete from S3 (best-effort — log only, never throw)
    await this.storage.delete(publicPath).catch(() => undefined);
  }

  private resolveColorInput(
    dto: CreateProductDto | UpdateProductDto,
  ): string {
    const body = dto as unknown as Record<string, unknown>;
    const raw = body.color ?? body.colour;
    if (raw == null) return '';
    const normalized = String(raw).trim();
    if (
      normalized === '' ||
      normalized.toLowerCase() === 'null' ||
      normalized.toLowerCase() === 'undefined'
    ) {
      return '';
    }
    return normalized;
  }

  private parseImageColorsJson(raw?: string, expectedLength = 0): string[] {
    if (!raw || String(raw).trim() === '') {
      return Array.from({ length: expectedLength }, () => '');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      throw new BadRequestException('imageColors must be valid JSON array');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('imageColors must be a JSON array');
    }
    return parsed.map((item) => String(item ?? '').trim());
  }

  private toResponse(product: ProductAdminRow): ProductResponse {
    const {
      productMeasurementAttributes: pmaRows,
      category: catRaw,
      subcategory: subRaw,
      productFabrics: pfRows,
      images: imgRows,
      variants: varRows,
      ...productCore
    } = product;

    const variants: ProductVariantResponse[] = [...varRows]
      .sort((a, b) =>
        a.size.localeCompare(b.size, undefined, { sensitivity: 'base' }),
      )
      .map((v) => ({
        ...v,
        catalogSize: v.catalogSize ?? null,
      }));
    const variantSum = variants.reduce((s, v) => s + v.quantity, 0);
    const displayQuantity =
      variants.length > 0 ? variantSum : productCore.quantity;

    const basePrice = Number(productCore.price);
    const rawDiscount = productCore.discountPercent;
    const discountPercent =
      rawDiscount != null && rawDiscount > 0
        ? Math.min(100, Math.floor(rawDiscount))
        : null;
    const salePrice =
      discountPercent != null
        ? Math.round(basePrice * (100 - discountPercent)) / 100
        : basePrice;

    const cat = catRaw;

    const productFabrics: ProductFabricResponse[] = [...pfRows].map((pf) => ({
      id: pf.id,
      productId: pf.productId,
      fabricId: pf.fabricId,
      percent: pf.percent,
      fabric: {
        id: pf.fabric.id,
        name: pf.fabric.name,
        slug: pf.fabric.slug,
      },
    }));

    const measurementAttributes: ProductMeasurementAttributeSummary[] = pmaRows.map((row) => ({
      id: row.attribute.id,
      slug: row.attribute.slug,
      label: row.attribute.label,
      unit: row.attribute.unit,
      sortOrder: row.sortOrder,
    }));

    return {
      ...productCore,
      category: cat
        ? { id: cat.id, name: cat.name, slug: cat.slug }
        : null,
      subcategory: subRaw
        ? {
            id: subRaw.id,
            name: subRaw.name,
            slug: subRaw.slug,
            categoryId: subRaw.categoryId,
          }
        : null,
      productFabrics,
      measurementAttributes,
      discountPercent,
      quantity: displayQuantity,
      price: basePrice,
      salePrice,
      images: [...imgRows].sort((a, b) => a.sortOrder - b.sortOrder),
      variants,
    };
  }
}
