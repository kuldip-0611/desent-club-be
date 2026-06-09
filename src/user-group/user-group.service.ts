import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CouponService } from '../coupon/coupon.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserGroupDto } from './dto/create-user-group.dto';
import { UpdateUserGroupDto } from './dto/update-user-group.dto';

@Injectable()
export class UserGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponService: CouponService,
  ) {}

  async findAll() {
    return this.prisma.userGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true, couponLinks: true } },
      },
    });
  }

  async findOne(id: string) {
    const group = await this.prisma.userGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                isVerified: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        couponLinks: {
          include: {
            coupon: {
              select: { id: true, code: true, isActive: true },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });
    if (!group) {
      throw new NotFoundException('User group not found');
    }
    return group;
  }

  async create(dto: CreateUserGroupDto) {
    return this.prisma.userGroup.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        isActive: dto.isActive ?? true,
      },
      include: {
        _count: { select: { members: true } },
      },
    });
  }

  async update(id: string, dto: UpdateUserGroupDto) {
    await this.findOne(id);
    return this.prisma.userGroup.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        _count: { select: { members: true } },
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.userGroup.delete({ where: { id } });
  }

  async addMember(groupId: string, userId: string) {
    await this.findOne(groupId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    try {
      return await this.prisma.userGroupMember.create({
        data: { userGroupId: groupId, userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('User is already in this group');
      }
      throw e;
    }
  }

  async removeMember(groupId: string, userId: string) {
    const member = await this.prisma.userGroupMember.findFirst({
      where: { userGroupId: groupId, userId },
    });
    if (!member) {
      throw new NotFoundException('Member not found in group');
    }
    await this.prisma.userGroupMember.delete({ where: { id: member.id } });
  }

  async assignCoupon(groupId: string, couponId: string) {
    await this.findOne(groupId);
    await this.couponService.assignCouponToGroup(couponId, groupId);
    return this.findOne(groupId);
  }

  async unassignCoupon(groupId: string, couponId: string) {
    await this.couponService.unassignCouponFromGroup(couponId, groupId);
    return this.findOne(groupId);
  }
}
