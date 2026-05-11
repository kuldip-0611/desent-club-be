import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFabricDto } from './dto/create-fabric.dto';
import { UpdateFabricDto } from './dto/update-fabric.dto';

@Injectable()
export class FabricService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.fabric.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.fabric.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Fabric not found');
    return row;
  }

  async create(dto: CreateFabricDto) {
    const slug = dto.slug.trim().toLowerCase();
    const clash = await this.prisma.fabric.findUnique({ where: { slug } });
    if (clash) {
      throw new BadRequestException('A fabric with this slug already exists');
    }
    return this.prisma.fabric.create({
      data: {
        slug,
        name: dto.name.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateFabricDto) {
    await this.findOne(id);
    if (dto.slug != null) {
      const slug = dto.slug.trim().toLowerCase();
      const exists = await this.prisma.fabric.findFirst({
        where: { slug, NOT: { id } },
      });
      if (exists) {
        throw new BadRequestException('A fabric with this slug already exists');
      }
    }
    const data: {
      slug?: string;
      name?: string;
      sortOrder?: number;
      isActive?: boolean;
    } = {};
    if (dto.slug != null) data.slug = dto.slug.trim().toLowerCase();
    if (dto.name != null) data.name = dto.name.trim();
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    return this.prisma.fabric.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.fabric.delete({ where: { id } });
  }
}
