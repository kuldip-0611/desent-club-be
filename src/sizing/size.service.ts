import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSizeDto } from './dto/create-size.dto';
import { SizeMeasurementInputDto } from './dto/size-measurement-input.dto';
import { UpdateSizeDto } from './dto/update-size.dto';

const sizeInclude = {
  measurementValues: {
    include: { attribute: true },
    orderBy: { attribute: { sortOrder: 'asc' } },
  },
} satisfies Prisma.SizeInclude;

export type SizeResponse = Prisma.SizeGetPayload<{ include: typeof sizeInclude }>;

@Injectable()
export class SizeService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<SizeResponse[]> {
    return this.prisma.size.findMany({
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: sizeInclude,
    });
  }

  async findOne(id: string): Promise<SizeResponse> {
    const row = await this.prisma.size.findUnique({
      where: { id },
      include: sizeInclude,
    });
    if (!row) {
      throw new NotFoundException('Size not found');
    }
    return row;
  }

  async create(dto: CreateSizeDto): Promise<SizeResponse> {
    const code = dto.code.trim();
    const existing = await this.prisma.size.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException('A size with this code already exists');
    }
    await this.validateMeasurementAttributeIds(dto.measurements ?? []);

    return this.prisma.$transaction(async (tx) => {
      const size = await tx.size.create({
        data: {
          code,
          name: dto.name?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          valueUnit: dto.valueUnit ?? null,
        },
      });
      await this.syncMeasurements(tx, size.id, dto.measurements ?? []);
      return tx.size.findUniqueOrThrow({
        where: { id: size.id },
        include: sizeInclude,
      });
    });
  }

  async update(id: string, dto: UpdateSizeDto): Promise<SizeResponse> {
    await this.findOne(id);
    if (dto.code != null) {
      const code = dto.code.trim();
      const clash = await this.prisma.size.findFirst({
        where: { code, NOT: { id } },
      });
      if (clash) {
        throw new BadRequestException('A size with this code already exists');
      }
    }
    if (dto.measurements != null) {
      await this.validateMeasurementAttributeIds(dto.measurements);
    }

    return this.prisma.$transaction(async (tx) => {
      const data: Prisma.SizeUpdateInput = {};
      if (dto.code != null) data.code = dto.code.trim();
      if (dto.name !== undefined) data.name = dto.name?.trim() || null;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
      if (dto.valueUnit !== undefined) data.valueUnit = dto.valueUnit;
      if (dto.isActive !== undefined) data.isActive = dto.isActive;

      if (Object.keys(data).length > 0) {
        await tx.size.update({ where: { id }, data });
      }

      if (dto.measurements != null) {
        await this.syncMeasurements(tx, id, dto.measurements);
      }

      return tx.size.findUniqueOrThrow({
        where: { id },
        include: sizeInclude,
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const variantCount = await this.prisma.productVariant.count({
      where: { sizeId: id },
    });
    if (variantCount > 0) {
      throw new BadRequestException(
        `Cannot delete size: ${variantCount} product variant(s) are using it. Remove or reassign them first.`,
      );
    }
    await this.prisma.size.delete({ where: { id } });
  }

  private async validateMeasurementAttributeIds(
    rows: SizeMeasurementInputDto[],
  ): Promise<void> {
    const ids = [...new Set(rows.map((r) => r.attributeId))];
    if (ids.length === 0) {
      return;
    }
    const count = await this.prisma.measurementAttribute.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('One or more measurement attribute ids are invalid');
    }
  }

  private async syncMeasurements(
    tx: Prisma.TransactionClient,
    sizeId: string,
    rows: SizeMeasurementInputDto[],
  ): Promise<void> {
    await tx.sizeMeasurementValue.deleteMany({ where: { sizeId } });
    const toCreate = rows
      .map((r) => ({
        sizeId,
        attributeId: r.attributeId,
        value: r.value.trim(),
      }))
      .filter((r) => r.value.length > 0);
    if (toCreate.length > 0) {
      await tx.sizeMeasurementValue.createMany({ data: toCreate });
    }
  }
}
