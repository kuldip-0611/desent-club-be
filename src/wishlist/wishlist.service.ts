import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async getWishlist(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            price: true,
            discountPercent: true,
            isAvailable: true,
            images: { take: 1, orderBy: { sortOrder: 'asc' }, select: { path: true } },
            variants: { select: { quantity: true } },
          },
        },
      },
    });
    return items.map((i) => ({
      id: i.id,
      addedAt: i.createdAt,
      product: {
        id: i.product.id,
        name: i.product.name,
        price: Number(i.product.price),
        discountPercent: i.product.discountPercent,
        isAvailable: i.product.isAvailable,
        image: i.product.images[0]?.path ?? null,
        totalStock: i.product.variants.reduce((s, v) => s + v.quantity, 0),
      },
    }));
  }

  async getProductIds(userId: string): Promise<string[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      select: { productId: true },
    });
    return items.map((i) => i.productId);
  }

  async addItem(userId: string, productId: string) {
    return this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  async removeItem(userId: string, productId: string) {
    return this.prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });
  }

  async syncItems(userId: string, productIds: string[]) {
    // Called on login — merge localStorage ids into server wishlist
    if (!productIds.length) return;
    const data = productIds.map((productId) => ({ userId, productId }));
    await this.prisma.$transaction(
      data.map((d) =>
        this.prisma.wishlistItem.upsert({
          where: { userId_productId: { userId: d.userId, productId: d.productId } },
          create: d,
          update: {},
        }),
      ),
    );
  }

  async clearAll(userId: string) {
    return this.prisma.wishlistItem.deleteMany({ where: { userId } });
  }
}
