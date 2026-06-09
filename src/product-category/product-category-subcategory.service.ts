import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategorySubcategoryDto } from './dto/create-product-category-subcategory.dto';
import { UpdateProductCategorySubcategoryDto } from './dto/update-product-category-subcategory.dto';

@Injectable()
export class ProductCategorySubcategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private imagePath(filename: string): string {
    return `/uploads/subcategories/${filename}`;
  }

  private deleteUploadedImage(path: string | null | undefined): void {
    if (!path || !path.startsWith('/uploads/subcategories/')) return;
    const absolutePath = join(process.cwd(), path.replace(/^\//, ''));
    if (!existsSync(absolutePath)) return;
    try {
      unlinkSync(absolutePath);
    } catch {
      // best-effort cleanup only
    }
  }

  private normalizeSlug(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async ensureParentCategory(categoryId: string): Promise<void> {
    const row = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!row) {
      throw new NotFoundException('Category not found');
    }
  }

  async findByCategoryId(categoryId: string) {
    await this.ensureParentCategory(categoryId);
    return this.prisma.productCategorySubcategory.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(
    categoryId: string,
    dto: CreateProductCategorySubcategoryDto,
    image?: Express.Multer.File,
  ) {
    if (!image) {
      throw new BadRequestException('Subcategory image is required');
    }
    await this.ensureParentCategory(categoryId);
    const slug = this.normalizeSlug(dto.slug);
    if (!slug) {
      throw new BadRequestException('Subcategory slug is invalid');
    }
    const clash = await this.prisma.productCategorySubcategory.findUnique({
      where: { categoryId_slug: { categoryId, slug } },
    });
    if (clash) {
      throw new BadRequestException('A subcategory with this slug already exists in this category');
    }
    return this.prisma.productCategorySubcategory.create({
      data: {
        categoryId,
        slug,
        name: dto.name.trim(),
        image: this.imagePath(image.filename),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.productCategorySubcategory.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Subcategory not found');
    }
    return row;
  }

  async update(
    id: string,
    dto: UpdateProductCategorySubcategoryDto,
    image?: Express.Multer.File,
  ) {
    const current = await this.findOne(id);
    const data: {
      slug?: string;
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
      image?: string;
    } = {};

    if (dto.slug !== undefined && dto.slug !== null && String(dto.slug).trim() !== '') {
      const slug = this.normalizeSlug(dto.slug);
      if (!slug) {
        throw new BadRequestException('Subcategory slug is invalid');
      }
      const exists = await this.prisma.productCategorySubcategory.findFirst({
        where: { categoryId: current.categoryId, slug, NOT: { id } },
      });
      if (exists) {
        throw new BadRequestException('A subcategory with this slug already exists in this category');
      }
      data.slug = slug;
    }
    if (dto.name != null && String(dto.name).trim() !== '') {
      data.name = dto.name.trim();
    }
    if (dto.sortOrder !== undefined && dto.sortOrder !== null) {
      data.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined && dto.isActive !== null) {
      data.isActive = dto.isActive;
    }
    if (image) {
      this.deleteUploadedImage(current.image);
      data.image = this.imagePath(image.filename);
    }

    return this.prisma.productCategorySubcategory.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    await this.prisma.productCategorySubcategory.delete({ where: { id } });
    this.deleteUploadedImage(row.image);
  }
}
