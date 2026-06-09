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
import { NotificationService } from '../notification/notification.service';
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
  userLinks?: {
    id: string;
    userId: string;
    user: { id: string; name: string; email: string | null };
  }[];
  userGroupLinks?: {
    id: string;
    userGroupId: string;
    userGroup: { id: string; name: string };
  }[];
};

@Injectable()
export class CouponService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

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

  private readonly couponInclude = {
    categoryLinks: {
      include: { category: { select: { id: true, name: true, slug: true } } },
    },
    userLinks: {
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    },
    userGroupLinks: {
      include: {
        userGroup: { select: { id: true, name: true } },
      },
    },
  };

  async findAll(): Promise<CouponWithCategories[]> {
    return this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      include: this.couponInclude,
    });
  }

  async findOne(id: string): Promise<CouponWithCategories> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: this.couponInclude,
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
    const coupon = await this.prisma.coupon.create({
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
        perUserLimit: dto.perUserLimit,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        isActive: dto.isActive ?? true,
        categoryLinks: categoryIds.length
          ? {
              create: categoryIds.map((categoryId) => ({ categoryId })),
            }
          : undefined,
      },
      include: this.couponInclude,
    });

    // Notify all users when a public (unrestricted) active coupon is created
    if (coupon.isActive) {
      this.notificationService.notifyAllUsersNewCoupon({
        code: coupon.code,
        discountType: coupon.discountType,
        value: coupon.value.toString(),
        minSubtotal: coupon.minSubtotal?.toString() ?? null,
        maxDiscount: coupon.maxDiscount?.toString() ?? null,
        endsAt: coupon.endsAt,
      });
    }

    return coupon;
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
        ...(dto.perUserLimit !== undefined ? { perUserLimit: dto.perUserLimit } : {}),
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
      include: this.couponInclude,
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
  async couponHasAudienceRestrictions(couponId: string): Promise<boolean> {
    const [userCount, groupCount] = await this.prisma.$transaction([
      this.prisma.couponUser.count({ where: { couponId } }),
      this.prisma.couponUserGroup.count({ where: { couponId } }),
    ]);
    return userCount > 0 || groupCount > 0;
  }

  async isUserEligibleForCoupon(
    couponId: string,
    userId: string,
  ): Promise<boolean> {
    const restricted = await this.couponHasAudienceRestrictions(couponId);
    if (!restricted) return true;

    const direct = await this.prisma.couponUser.findFirst({
      where: { couponId, userId },
    });
    if (direct) return true;

    const viaGroup = await this.prisma.couponUserGroup.findFirst({
      where: {
        couponId,
        userGroup: {
          isActive: true,
          members: { some: { userId } },
        },
      },
    });
    return Boolean(viaGroup);
  }

  async assignCouponToUser(couponId: string, userId: string): Promise<void> {
    const coupon = await this.findOne(couponId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.prisma.couponUser.upsert({
      where: { couponId_userId: { couponId, userId } },
      create: { couponId, userId },
      update: {},
    });

    this.notificationService.notifyUserCouponAssigned(
      { email: user.email, name: user.name },
      {
        code: coupon.code,
        discountType: coupon.discountType,
        value: coupon.value.toString(),
        minSubtotal: coupon.minSubtotal?.toString() ?? null,
        maxDiscount: coupon.maxDiscount?.toString() ?? null,
        endsAt: coupon.endsAt,
      },
    );
  }

  async unassignCouponFromUser(couponId: string, userId: string): Promise<void> {
    await this.prisma.couponUser.deleteMany({
      where: { couponId, userId },
    });
  }

  async assignCouponToGroup(couponId: string, userGroupId: string): Promise<void> {
    const coupon = await this.findOne(couponId);
    const group = await this.prisma.userGroup.findUnique({
      where: { id: userGroupId },
      include: {
        members: {
          include: {
            user: { select: { email: true, name: true } },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('User group not found');
    }
    await this.prisma.couponUserGroup.upsert({
      where: { couponId_userGroupId: { couponId, userGroupId } },
      create: { couponId, userGroupId },
      update: {},
    });

    const members = group.members.map((m) => ({
      email: m.user.email,
      name: m.user.name,
    }));
    this.notificationService.notifyGroupMembersCouponAssigned(
      members,
      group.name,
      {
        code: coupon.code,
        discountType: coupon.discountType,
        value: coupon.value.toString(),
        minSubtotal: coupon.minSubtotal?.toString() ?? null,
        maxDiscount: coupon.maxDiscount?.toString() ?? null,
        endsAt: coupon.endsAt,
      },
    );
  }

  async unassignCouponFromGroup(
    couponId: string,
    userGroupId: string,
  ): Promise<void> {
    await this.prisma.couponUserGroup.deleteMany({
      where: { couponId, userGroupId },
    });
  }

  async listAvailableCouponsForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const groupIds = (
      await this.prisma.userGroupMember.findMany({
        where: { userId, userGroup: { isActive: true } },
        select: { userGroupId: true },
      })
    ).map((m) => m.userGroupId);

    const coupons = await this.prisma.coupon.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
        userLinks: { where: { userId }, select: { id: true } },
        userGroupLinks: {
          where: { userGroupId: { in: groupIds } },
          include: { userGroup: { select: { id: true, name: true } } },
        },
        _count: {
          select: {
            userLinks: true,
            userGroupLinks: true,
            redemptions: { where: { userId } },
          },
        },
      },
    });

    const now = new Date();
    return coupons
      .map((coupon) => {
        const restricted =
          coupon._count.userLinks > 0 || coupon._count.userGroupLinks > 0;
        const directAssign = coupon.userLinks.length > 0;
        const groupAssign = coupon.userGroupLinks;
        const eligible = !restricted || directAssign || groupAssign.length > 0;
        const expired = coupon.endsAt ? now > coupon.endsAt : false;
        const notStarted = coupon.startsAt ? now < coupon.startsAt : false;
        const usageExhausted =
          coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit;

        // per-user limit: default 1 if admin hasn't set a higher limit
        const userLimit = coupon.perUserLimit ?? 1;
        const userUsed = coupon._count.redemptions;
        const userLimitReached = userUsed >= userLimit;

        let source: 'public' | 'direct' | 'group' = 'public';
        if (directAssign) source = 'direct';
        else if (groupAssign.length > 0) source = 'group';

        return {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          value: coupon.value.toString(),
          minSubtotal: coupon.minSubtotal?.toString() ?? null,
          maxDiscount: coupon.maxDiscount?.toString() ?? null,
          usageLimit: coupon.usageLimit,
          perUserLimit: userLimit,
          usedCount: coupon.usedCount,
          userUsedCount: userUsed,
          startsAt: coupon.startsAt,
          endsAt: coupon.endsAt,
          isActive: coupon.isActive,
          categoryLinks: coupon.categoryLinks,
          restricted,
          eligible,
          source,
          assignedGroups: groupAssign.map((g) => g.userGroup),
          status: !eligible
            ? 'not_eligible'
            : expired
              ? 'expired'
              : notStarted
                ? 'scheduled'
                : usageExhausted
                  ? 'limit_reached'
                  : userLimitReached
                    ? 'already_used'
                    : 'available',
        };
      })
      .filter((c) => c.eligible && c.status === 'available');
  }

  async listApplicableForCart(
    subtotal: number,
    categoryIds?: string[],
    userId?: string,
  ) {
    const coupons = await this.prisma.coupon.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
      include: {
        categoryLinks: {
          include: { category: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    const applicable: {
      id: string;
      code: string;
      discountType: CouponDiscountType;
      value: string;
      minSubtotal: string | null;
      maxDiscount: string | null;
      discountAmount: string;
      categories: { id: string; name: string; slug: string }[];
    }[] = [];

    const hasCartCategories = categoryIds && categoryIds.length > 0;

    for (const coupon of coupons) {
      const restricted = await this.couponHasAudienceRestrictions(coupon.id);
      if (restricted && !userId) {
        continue;
      }

      // When cart category IDs are known, filter out coupons whose categories
      // don't match. When cart categories are unknown (no categoryIds sent),
      // show all coupons so the user can discover them.
      if (hasCartCategories && coupon.categoryLinks.length > 0) {
        const cartSet = new Set(categoryIds);
        const matches = coupon.categoryLinks.some((l) => cartSet.has(l.categoryId));
        if (!matches) continue;
      }

      // Validate all rules except category (handled above) so we don't
      // double-reject when categoryIds is absent.
      const validation = await this.validateForSubtotal(
        coupon.code,
        subtotal,
        categoryIds,
        userId,
        true,
      );

      if (!validation.valid) {
        continue;
      }

      applicable.push({
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        value: coupon.value.toString(),
        minSubtotal: coupon.minSubtotal?.toString() ?? null,
        maxDiscount: coupon.maxDiscount?.toString() ?? null,
        discountAmount: validation.discountAmount,
        categories: coupon.categoryLinks.map((link) => link.category),
      });
    }

    return applicable;
  }

  async validateForSubtotal(
    rawCode: string,
    subtotal: number,
    categoryIds?: string[],
    userId?: string,
    skipCategoryCheck = false,
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

    if (!skipCategoryCheck && coupon.categoryLinks.length > 0) {
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

    if (userId) {
      const eligible = await this.isUserEligibleForCoupon(coupon.id, userId);
      if (!eligible) {
        return {
          valid: false,
          message: 'This coupon is not available for your account',
          discountAmount: '0.00',
          subtotal: fmt(sub),
          subtotalAfterDiscount: fmt(sub),
        };
      }

      // Default: once per user. Admin can raise the limit via perUserLimit.
      const userLimit = coupon.perUserLimit ?? 1;
      const userUses = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
      });
      if (userUses >= userLimit) {
        return {
          valid: false,
          message:
            userLimit === 1
              ? 'You have already used this coupon'
              : `You have already used this coupon ${userUses} time(s) (max ${userLimit})`,
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
   * Increment global usage AND record per-user redemption after a successful order.
   * Call from OrderService within the same DB transaction as order creation.
   */
  async redeem(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
  ): Promise<void> {
    const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
    if (!coupon) {
      throw new BadRequestException('Coupon not found');
    }
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    // Increment global usage counter
    await tx.coupon.update({
      where: { id: couponId },
      data: { usedCount: { increment: 1 } },
    });

    // Record per-user redemption so the once-per-user check works correctly
    await tx.couponRedemption.create({
      data: { couponId, userId },
    });
  }
}
