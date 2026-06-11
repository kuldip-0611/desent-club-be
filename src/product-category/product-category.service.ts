import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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

    const { url } = await this.storage.upload(image, 'categories');

    return this.prisma.productCategory.create({
      data: {
        slug,
        name: dto.name.trim(),
        image: url,
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
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    if (image) {
      const { url } = await this.storage.upload(image, 'categories');
      data.image = url;
    }

    const updated = await this.prisma.productCategory.update({ where: { id }, data });

    // Delete old S3 image after successful update
    if (image && current.image) {
      await this.storage.delete(current.image).catch(() => undefined);
    }

    return updated;
  }

  async remove(id: string) {
    const existing = await this.findOne(id);
    await this.prisma.productCategory.delete({ where: { id } });
    if (existing.image) {
      await this.storage.delete(existing.image).catch(() => undefined);
    }
  }
}
