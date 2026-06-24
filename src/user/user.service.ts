import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { Prisma } from '@prisma/client';
import { AuthProviderType, User, UserRole } from '@prisma/client';
import { join } from 'path';
import { CouponService } from '../coupon/coupon.service';
import { PrismaService } from '../prisma/prisma.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly couponService: CouponService,
  ) {}

  async listForAdmin(query: ListUsersQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
    const search = String(query.search ?? '').trim();

    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
      ...(query.isVerified !== undefined ? { isVerified: query.isVerified } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [rows, total, verified, admins] = await this.prismaService.$transaction([
      this.prismaService.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prismaService.user.count({ where }),
      this.prismaService.user.count({ where: { ...where, isVerified: true } }),
      this.prismaService.user.count({ where: { ...where, role: UserRole.ADMIN } }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items: rows,
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      summary: {
        total,
        verified,
        admins,
      },
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { phone } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prismaService.user.findUnique({ where: { id } });
  }

  async createUser(input: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: UserRole;
    isVerified?: boolean;
    provider: AuthProviderType;
  }): Promise<User> {
    return this.prismaService.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        password: input.password,
        role: input.role ?? UserRole.USER,
        isVerified: input.isVerified ?? false,
        provider: input.provider,
      },
    });
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { refreshToken },
    });
  }

  private deleteProfileImage(path: string | null | undefined): void {
    if (!path || !path.startsWith('/uploads/profiles/')) return;
    const absolutePath = join(process.cwd(), path.replace(/^\//, ''));
    if (!existsSync(absolutePath)) return;
    try {
      unlinkSync(absolutePath);
    } catch {
      // best effort
    }
  }

  async updateProfileImage(userId: string, imagePath: string): Promise<User> {
    const current = await this.findById(userId);
    const updated = await this.prismaService.user.update({
      where: { id: userId },
      data: { profileImage: imagePath },
    });
    if (current?.profileImage && current.profileImage !== imagePath) {
      this.deleteProfileImage(current.profileImage);
    }
    return updated;
  }

  async getAdminDetail(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      include: {
        groupMemberships: {
          include: {
            userGroup: {
              select: { id: true, name: true, isActive: true },
            },
          },
        },
        couponAssignments: {
          include: {
            coupon: {
              select: {
                id: true,
                code: true,
                discountType: true,
                value: true,
                isActive: true,
                endsAt: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const availableCoupons =
      await this.couponService.listAvailableCouponsForUser(userId);
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        provider: user.provider,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      groups: user.groupMemberships.map((m) => m.userGroup),
      assignedCoupons: user.couponAssignments.map((a) => a.coupon),
      availableCoupons,
    };
  }

  async listAvailableCouponsForUser(userId: string) {
    return this.couponService.listAvailableCouponsForUser(userId);
  }

  async assignCouponToUser(userId: string, couponId: string) {
    await this.couponService.assignCouponToUser(couponId, userId);
    return this.getAdminDetail(userId);
  }

  async unassignCouponFromUser(userId: string, couponId: string) {
    await this.couponService.unassignCouponFromUser(couponId, userId);
    return this.getAdminDetail(userId);
  }

  async validateCouponForUser(
    userId: string,
    code: string,
    subtotal = 0,
    categoryIds?: string[],
  ) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.couponService.validateForSubtotal(
      code,
      subtotal,
      categoryIds,
      userId,
    );
  }

  async saveFcmToken(userId: string, token: string): Promise<void> {
    await this.prismaService.user.update({
      where: { id: userId },
      data: { fcmToken: token },
    });
    this.logger.log(`FCM token saved for user ${userId} (token: …${token.slice(-12)})`);
  }

  async updateByAdmin(userId: string, dto: UpdateUserAdminDto): Promise<User> {
    const data: Prisma.UserUpdateInput = {};
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isVerified !== undefined) data.isVerified = dto.isVerified;

    try {
      return await this.prismaService.user.update({
        where: { id: userId },
        data,
      });
    } catch {
      throw new NotFoundException('User not found');
    }
  }
}
