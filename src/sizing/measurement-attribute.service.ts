import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeasurementAttributeDto } from './dto/create-measurement-attribute.dto';
import { UpdateMeasurementAttributeDto } from './dto/update-measurement-attribute.dto';

@Injectable()
export class MeasurementAttributeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.measurementAttribute.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.measurementAttribute.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Measurement attribute not found');
    }
    return row;
  }

  async create(dto: CreateMeasurementAttributeDto) {
    const slug = dto.slug.trim().toLowerCase();
    const clash = await this.prisma.measurementAttribute.findUnique({
      where: { slug },
    });
    if (clash) {
      throw new BadRequestException('An attribute with this slug already exists');
    }
    return this.prisma.measurementAttribute.create({
      data: {
        slug,
        label: dto.label.trim(),
        unit: dto.unit ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateMeasurementAttributeDto) {
    await this.findOne(id);
    if (dto.slug != null) {
      const slug = dto.slug.trim().toLowerCase();
      const exists = await this.prisma.measurementAttribute.findFirst({
        where: { slug, NOT: { id } },
      });
      if (exists) {
        throw new BadRequestException('An attribute with this slug already exists');
      }
    }
    const data: Prisma.MeasurementAttributeUpdateInput = {};
    if (dto.slug != null) data.slug = dto.slug.trim().toLowerCase();
    if (dto.label != null) data.label = dto.label.trim();
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.measurementAttribute.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.measurementAttribute.delete({ where: { id } });
  }
}
