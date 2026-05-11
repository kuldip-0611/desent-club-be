import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Coupon,
  CouponDiscountType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

export type CouponValidationResult = {
  valid: boolean;
  message?: string;
  couponId?: string;
  code?: string;
  discountAmount: string;
  subtotal: string;
  subtotalAfterDiscount: string;
};

export type CouponWithCategories = Coupon & {
  categoryLinks: { categoryId: string; category: { id: string; name: string; slug: string } }[];
};

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private assertCouponRules(
    dto: CreateCouponDto | UpdateCouponDto,
    partial?: { discountType?: CouponDiscountType },
  ): void {
    const type = dto.discountType ?? partial?.discountType;
    if (type === CouponDiscountType.PERCENT) {
      if (dto.value != null && dto.value > 100) {
        throw new BadRequestException('Percent discount cannot exceed 100');
      }
    }
    if (dto.startsAt && dto.endsAt) {
      if (new Date(dto.endsAt) < new Date(dto.startsAt)) {
        throw new BadRequestException('endsAt must be after startsAt');
      }
    }
  }

  private normalizeCategoryIds(ids?: string[]): string[] {
    return [...new Set((ids ?? []).map((x) => x.trim()).filter(Boolean))];
  }

  private async assertCategoriesExist(categoryIds: string[]): Promise<void> {
    if (!categoryIds.length) return;
    const count = await this.prisma.productCategory.count({
      where: { id: { in: categoryIds } },
    });
    if (count !== categoryIds.length) {
      throw new BadRequestException('One or more category ids are invalid');
    }
  }

  async findAll(): Promise<CouponWithCategories[]> {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
  }

  async findOne(id: string): Promise<CouponWithCategories> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async create(dto: CreateCouponDto): Promise<CouponWithCategories> {
    this.assertCouponRules(dto);
    const code = this.normalizeCode(dto.code);
    const categoryIds = this.normalizeCategoryIds(dto.categoryIds);
    await this.assertCategoriesExist(categoryIds);
    const existing = await this.prisma.coupon.findUnique({
      where: { code },
    });
    if (existing) {
      throw new BadRequestException('A coupon with this code already exists');
    }
    return this.prisma.coupon.create({
      data: {
        code,
        discountType: dto.discountType,
        value: new Prisma.Decimal(dto.value),
        minSubtotal:
          dto.minSubtotal != null
            ? new Prisma.Decimal(dto.minSubtotal)
            : undefined,
        maxDiscount:
          dto.maxDiscount != null
            ? new Prisma.Decimal(dto.maxDiscount)
            : undefined,
        usageLimit: dto.usageLimit,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? true,
        categoryLinks: categoryIds.length
          ? {
              create: categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
  }

  async update(id: string, dto: UpdateCouponDto): Promise<CouponWithCategories> {
    const current = await this.findOne(id);
    if (dto.discountType != null || dto.value != null) {
      this.assertCouponRules(
        {
          ...dto,
          discountType: dto.discountType ?? current.discountType,
          value: dto.value ?? Number(current.value),
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
        } as CreateCouponDto,
        { discountType: current.discountType },
      );
    }
    if (dto.code != null) {
      const code = this.normalizeCode(dto.code);
      const clash = await this.prisma.coupon.findFirst({
        where: { code, NOT: { id } },
      });
      if (clash) {
        throw new BadRequestException('A coupon with this code already exists');
      }
    }
    const normalizedCategoryIds =
      dto.categoryIds !== undefined
        ? this.normalizeCategoryIds(dto.categoryIds)
        : undefined;
    if (normalizedCategoryIds !== undefined) {
      await this.assertCategoriesExist(normalizedCategoryIds);
    }
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.code != null ? { code: this.normalizeCode(dto.code) } : {}),
        ...(dto.discountType != null ? { discountType: dto.discountType } : {}),
        ...(dto.value != null ? { value: new Prisma.Decimal(dto.value) } : {}),
        ...(dto.minSubtotal !== undefined
          ? {
              minSubtotal:
                dto.minSubtotal == null
                  ? null
                  : new Prisma.Decimal(dto.minSubtotal),
            }
          : {}),
        ...(dto.maxDiscount !== undefined
          ? {
              maxDiscount:
                dto.maxDiscount == null
                  ? null
                  : new Prisma.Decimal(dto.maxDiscount),
            }
          : {}),
        ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
        ...(dto.startsAt !== undefined
          ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null }
          : {}),
        ...(dto.endsAt !== undefined
          ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(normalizedCategoryIds !== undefined
          ? {
              categoryLinks: {
                deleteMany: {},
                ...(normalizedCategoryIds.length
                  ? {
                      create: normalizedCategoryIds.map((categoryId) => ({
                        categoryId,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.coupon.delete({ where: { id } });
  }

  /**
   * Validates coupon rules and returns discount for the given subtotal.
   * Does not increment usage — call `redeem` inside an order transaction when completing checkout.
   */
  async validateForSubtotal(
    rawCode: string,
    subtotal: number,
    categoryIds?: string[],
  ): Promise<CouponValidationResult> {
    const sub = new Prisma.Decimal(subtotal);
    const zero = new Prisma.Decimal(0);
    const fmt = (d: Prisma.Decimal) => d.toFixed(2);

    if (sub.lt(0)) {
      return {
        valid: false,
        message: 'Invalid subtotal',
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }

    const code = this.normalizeCode(rawCode);
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      include: { categoryLinks: { select: { categoryId: true } } },
    });
    if (!coupon || !coupon.isActive) {
      return {
        valid: false,
        message: 'Invalid or inactive coupon',
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      return {
        valid: false,
        message: 'This coupon is not active yet',
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }
    if (coupon.endsAt && now > coupon.endsAt) {
      return {
        valid: false,
        message: 'This coupon has expired',
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }

    if (
      coupon.usageLimit != null &&
      coupon.usedCount >= coupon.usageLimit
    ) {
      return {
        valid: false,
        message: 'This coupon has reached its usage limit',
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }

    if (coupon.minSubtotal && sub.lt(coupon.minSubtotal)) {
      return {
        valid: false,
        message: `Minimum order of ${fmt(coupon.minSubtotal)} required`,
        discountAmount: '0.00',
        subtotal: fmt(sub),
        subtotalAfterDiscount: fmt(sub),
      };
    }

    if (coupon.categoryLinks.length > 0) {
      const cartCategorySet = new Set(this.normalizeCategoryIds(categoryIds));
      const allowed = coupon.categoryLinks.some((link) =>
        cartCategorySet.has(link.categoryId),
      );
      if (!allowed) {
        return {
          valid: false,
          message: 'This coupon is not valid for selected categories',
          discountAmount: '0.00',
          subtotal: fmt(sub),
          subtotalAfterDiscount: fmt(sub),
        };
      }
    }

    let discount = zero;
    if (coupon.discountType === CouponDiscountType.PERCENT) {
      discount = sub.mul(coupon.value).div(100);
      if (coupon.maxDiscount && discount.gt(coupon.maxDiscount)) {
        discount = new Prisma.Decimal(coupon.maxDiscount);
      }
    } else {
      discount = new Prisma.Decimal(coupon.value);
    }

    if (discount.lt(0)) {
      discount = zero;
    }
    if (discount.gt(sub)) {
      discount = sub;
    }

    const after = sub.minus(discount);

    return {
      valid: true,
      couponId: coupon.id,
      code: coupon.code,
      discountAmount: fmt(discount),
      subtotal: fmt(sub),
      subtotalAfterDiscount: fmt(after),
    };
  }

  /**
   * Increment usage after a successful order. Call from OrderService within the same DB transaction as order creation.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    couponId: string,
  ): Promise<void> {
    const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }
    if (
      coupon.usageLimit != null &&
      coupon.usedCount >= coupon.usageLimit
    ) {
      throw new BadRequestException('Coupon usage limit reached');
    }
    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });
  }
}
