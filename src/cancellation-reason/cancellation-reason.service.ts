import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CancellationReasonService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public: active reasons for cancel modal ───────────────────────────────

  async listActive() {
    return this.prisma.cancellationReason.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, label: true },
    });
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  async listAll() {
    return this.prisma.cancellationReason.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(label: string, sortOrder = 0) {
    return this.prisma.cancellationReason.create({
      data: { label: label.trim(), sortOrder },
    });
  }

  async update(id: string, data: { label?: string; isActive?: boolean; sortOrder?: number }) {
    const existing = await this.prisma.cancellationReason.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cancellation reason not found');
    return this.prisma.cancellationReason.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.cancellationReason.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Cancellation reason not found');
    await this.prisma.cancellationReason.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  async seed() {
    const count = await this.prisma.cancellationReason.count();
    if (count > 0) return;
    const defaults = [
      'Changed my mind',
      'Found a better price elsewhere',
      'Ordered by mistake',
      'Delivery time is too long',
      'Want to change size or color',
      'Want to change delivery address',
      'Product no longer needed',
      'Other',
    ];
    await this.prisma.cancellationReason.createMany({
      data: defaults.map((label, i) => ({ label, sortOrder: i })),
    });
  }
}
