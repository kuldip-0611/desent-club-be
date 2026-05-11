import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [products, availableProducts, lowStockProducts, users, categories, coupons, recentProducts] =
      await this.prisma.$transaction([
        this.prisma.product.count(),
        this.prisma.product.count({ where: { isAvailable: true } }),
        this.prisma.product.count({ where: { quantity: { lte: 5 } } }),
        this.prisma.user.count(),
        this.prisma.productCategory.count(),
        this.prisma.coupon.count({ where: { isActive: true } }),
        this.prisma.product.findMany({
          orderBy: { updatedAt: 'desc' },
          take: 8,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            images: { orderBy: { sortOrder: 'asc' }, take: 1 },
          },
        }),
      ]);

    return {
      cards: {
        products,
        availableProducts,
        lowStockProducts,
        users,
        categories,
        activeCoupons: coupons,
      },
      recentProducts: recentProducts.map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity: product.quantity,
        isAvailable: product.isAvailable,
        updatedAt: product.updatedAt,
        category: product.category,
        image: product.images[0]?.path ?? null,
      })),
    };
  }
}
