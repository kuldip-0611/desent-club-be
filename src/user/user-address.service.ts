import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserAddressDto } from './dto/create-user-address.dto';
import { UpdateUserAddressDto } from './dto/update-user-address.dto';

@Injectable()
export class UserAddressService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string) {
    return this.prisma.userAddress.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createForUser(userId: string, dto: CreateUserAddressDto) {
    const count = await this.prisma.userAddress.count({ where: { userId } });
    const makeDefault = dto.isDefault === true || count === 0;

    if (makeDefault) {
      await this.prisma.userAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.userAddress.create({
      data: {
        userId,
        label: dto.label?.trim() || null,
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        line1: dto.line1.trim(),
        line2: dto.line2?.trim() || null,
        city: dto.city.trim(),
        state: dto.state.trim(),
        pincode: dto.pincode.trim(),
        country: dto.country?.trim() || 'India',
        isDefault: makeDefault,
      },
    });
  }

  async updateForUser(
    userId: string,
    addressId: string,
    dto: UpdateUserAddressDto,
  ) {
    await this.assertOwned(userId, addressId);

    if (dto.isDefault === true) {
      await this.prisma.userAddress.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.userAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.line1 !== undefined ? { line1: dto.line1.trim() } : {}),
        ...(dto.line2 !== undefined ? { line2: dto.line2?.trim() || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
        ...(dto.state !== undefined ? { state: dto.state.trim() } : {}),
        ...(dto.pincode !== undefined ? { pincode: dto.pincode.trim() } : {}),
        ...(dto.country !== undefined
          ? { country: dto.country?.trim() || 'India' }
          : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });
  }

  async deleteForUser(userId: string, addressId: string) {
    const existing = await this.assertOwned(userId, addressId);
    await this.prisma.userAddress.delete({ where: { id: addressId } });

    if (existing.isDefault) {
      const next = await this.prisma.userAddress.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      if (next) {
        await this.prisma.userAddress.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    return { deleted: true };
  }

  async setDefault(userId: string, addressId: string) {
    await this.assertOwned(userId, addressId);
    await this.prisma.userAddress.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    return this.prisma.userAddress.update({
      where: { id: addressId },
      data: { isDefault: true },
    });
  }

  private async assertOwned(userId: string, addressId: string) {
    const row = await this.prisma.userAddress.findUnique({
      where: { id: addressId },
    });
    if (!row) {
      throw new NotFoundException('Address not found');
    }
    if (row.userId !== userId) {
      throw new ForbiddenException('Address does not belong to this user');
    }
    return row;
  }
}
