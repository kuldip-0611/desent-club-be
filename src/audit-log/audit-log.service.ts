import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditContext {
  adminId: string;
  ipAddress?: string;
}

export type AuditAction =
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_BULK_STATUS_CHANGED'
  | 'ORDER_COD_REMITTED'
  | 'RETURN_STATUS_CHANGED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'PRODUCT_IMAGE_DELETED'
  | 'COUPON_CREATED'
  | 'COUPON_UPDATED'
  | 'COUPON_DELETED'
  | 'USER_UPDATED'
  | 'USER_SUSPENDED'
  | 'BANNER_CREATED'
  | 'BANNER_UPDATED'
  | 'BANNER_DELETED'
  | 'FLASH_SALE_CREATED'
  | 'FLASH_SALE_UPDATED'
  | 'FLASH_SALE_DELETED'
  | 'SETTINGS_UPDATED'
  | 'ADMIN_LOGIN';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(opts: {
    ctx: AuditContext;
    action: AuditAction;
    targetType: string;
    targetId?: string;
    targetLabel?: string;
    detail?: Record<string, unknown>;
  }): Promise<void> {
    try {
      const admin = await this.prisma.user.findUnique({
        where: { id: opts.ctx.adminId },
        select: { name: true, email: true },
      });
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: opts.ctx.adminId,
          adminName: admin?.name ?? 'Admin',
          adminEmail: admin?.email ?? '',
          action: opts.action,
          targetType: opts.targetType,
          targetId: opts.targetId ?? null,
          targetLabel: opts.targetLabel ?? null,
          detail: opts.detail ? JSON.stringify(opts.detail) : null,
          ipAddress: opts.ctx.ipAddress ?? null,
        },
      });
    } catch (err) {
      // Never crash on audit failure
      this.logger.error(`Audit log failed: ${(err as Error)?.message}`);
    }
  }

  async findAll(opts: {
    page?: number;
    limit?: number;
    action?: string;
    targetType?: string;
    adminId?: string;
    from?: string;
    to?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (opts.action) where.action = opts.action;
    if (opts.targetType) where.targetType = opts.targetType;
    if (opts.adminId) where.adminId = opts.adminId;
    if (opts.from || opts.to) {
      where.createdAt = {
        ...(opts.from ? { gte: new Date(opts.from) } : {}),
        ...(opts.to ? { lte: new Date(opts.to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }
}
