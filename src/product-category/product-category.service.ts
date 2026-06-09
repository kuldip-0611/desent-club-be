import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  private imagePath(filename: string): string {
    return `/uploads/categories/${filename}`;
  }

  private deleteUploadedImage(path: string | null | undefined): void {
    if (!path || !path.startsWith('/uploads/categories/')) return;
    const absolutePath = join(process.cwd(), path.replace(/^\//, ''));
    if (!existsSync(absolutePath)) return;
    try {
      unlinkSync(absolutePath);
    } catch {
      // best-effort cleanup only
    }
  }

  findAll() {
    return this.prisma.productCategory.findMany({
      orderBy: [{ name: 'asc' }],
      include: {
        _count: { select: { subcategories: true, products: true } },
      },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  async create(dto: CreateProductCategoryDto, image?: Express.Multer.File) {
    if (!image) {
      throw new BadRequestException('Category image is required');
    }
    const slug = dto.slug.trim().toLowerCase();
    const clash = await this.prisma.productCategory.findUnique({ where: { slug } });
    if (clash) {
      throw new BadRequestException('A category with this slug already exists');
    }
    return this.prisma.productCategory.create({
      data: {
        slug,
        name: dto.name.trim(),
        image: this.imagePath(image.filename),
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateProductCategoryDto, image?: Express.Multer.File) {
    const current = await this.findOne(id);
    if (dto.slug != null) {
      const slug = dto.slug.trim().toLowerCase();
      const exists = await this.prisma.productCategory.findFirst({
        where: { slug, NOT: { id } },
      });
      if (exists) {
        throw new BadRequestException('A category with this slug already exists');
      }
    }
    const data: {
      slug?: string;
      name?: string;
      image?: string | null;
      isActive?: boolean;
    } = {};
    if (dto.slug != null) data.slug = dto.slug.trim().toLowerCase();
    if (dto.name != null) data.name = dto.name.trim();
    if (image) data.image = this.imagePath(image.filename);
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const updated = await this.prisma.productCategory.update({
      where: { id },
      data,
    });
    if (image && current.image && current.image !== updated.image) {
      this.deleteUploadedImage(current.image);
    }
    return updated;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    await this.prisma.productCategory.delete({ where: { id } });
    this.deleteUploadedImage(existing.image);
  }
}
