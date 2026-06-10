import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(period: 'daily' | 'weekly' | 'monthly' = 'daily') {
    const now = new Date();
    let startDate: Date;
    let buckets: number;

    if (period === 'daily') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 29); // last 30 days
      buckets = 30;
    } else if (period === 'weekly') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 83); // last 12 weeks
      buckets = 12;
    } else {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 11); // last 12 months
      buckets = 12;
    }
    startDate.setHours(0, 0, 0, 0);

    const [paidOrders, allOrders, topProducts, ordersByStatus, newUsers, couponStats] = await Promise.all([
      // Paid orders in range for revenue chart
      this.prisma.order.findMany({
        where: {
          createdAt: { gte: startDate },
          payment: { status: 'PAID' },
        },
        select: { createdAt: true, total: true },
        orderBy: { createdAt: 'asc' },
      }),
      // All orders (including COD) in range for order count
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true, total: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Top 10 products by revenue
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { total: true, quantity: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      // Orders by status
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      // New users per period
      this.prisma.user.findMany({
        where: { createdAt: { gte: startDate }, role: 'USER' },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Coupon usage stats
      this.prisma.coupon.findMany({
        where: { isActive: true },
        select: { code: true, usedCount: true, _count: { select: { redemptions: true } } },
        orderBy: { usedCount: 'desc' },
        take: 10,
      }),
    ]);

    // Build time-series buckets
    const getBucketKey = (date: Date): string => {
      if (period === 'daily') {
        return date.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const d = new Date(date);
        d.setDate(d.getDate() - d.getDay()); // start of week
        return d.toISOString().split('T')[0];
      } else {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      }
    };

    // Generate all bucket labels
    const labels: string[] = [];
    for (let i = 0; i < buckets; i++) {
      const d = new Date(startDate);
      if (period === 'daily') d.setDate(startDate.getDate() + i);
      else if (period === 'weekly') d.setDate(startDate.getDate() + i * 7);
      else d.setMonth(startDate.getMonth() + i);
      labels.push(getBucketKey(d));
    }

    // Revenue chart
    const revenueMap = new Map<string, number>();
    for (const order of paidOrders) {
      const key = getBucketKey(order.createdAt);
      revenueMap.set(key, (revenueMap.get(key) ?? 0) + Number(order.total));
    }
    const revenueData = labels.map((label) => ({
      label,
      revenue: Math.round(revenueMap.get(label) ?? 0),
    }));

    // Order count chart
    const orderCountMap = new Map<string, number>();
    for (const order of allOrders) {
      const key = getBucketKey(order.createdAt);
      orderCountMap.set(key, (orderCountMap.get(key) ?? 0) + 1);
    }
    const orderCountData = labels.map((label) => ({
      label,
      orders: orderCountMap.get(label) ?? 0,
    }));

    // New users chart
    const userMap = new Map<string, number>();
    for (const user of newUsers) {
      const key = getBucketKey(user.createdAt);
      userMap.set(key, (userMap.get(key) ?? 0) + 1);
    }
    const newUsersData = labels.map((label) => ({
      label,
      users: userMap.get(label) ?? 0,
    }));

    // Top products — enrich with product names
    const productIds = topProducts.map((tp) => tp.productId);
    const productNames = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } },
        })
      : [];
    const nameMap = new Map(productNames.map((p) => [p.id, p]));
    const topProductsData = topProducts.map((tp) => {
      const product = nameMap.get(tp.productId);
      return {
        productId: tp.productId,
        name: product?.name ?? 'Unknown',
        image: product?.images[0]?.path ?? null,
        revenue: Math.round(Number(tp._sum.total ?? 0)),
        unitsSold: tp._sum.quantity ?? 0,
      };
    });

    return {
      period,
      revenueChart: revenueData,
      orderCountChart: orderCountData,
      newUsersChart: newUsersData,
      ordersByStatus: ordersByStatus.map((row) => ({
        status: row.status,
        count: row._count.id,
      })),
      topProducts: topProductsData,
      couponStats: couponStats.map((c) => ({
        code: c.code,
        usedCount: c.usedCount,
        redemptions: c._count.redemptions,
      })),
    };
  }

  async getOverview() {
    const [
      products,
      availableProducts,
      lowStockProducts,
      users,
      categories,
      coupons,
      totalOrders,
      pendingOrders,
      pendingReturns,
      recentProducts,
    ] = await this.prisma.$transaction([
        this.prisma.product.count(),
        this.prisma.product.count({ where: { isAvailable: true } }),
        this.prisma.product.count({ where: { quantity: { lte: 5 } } }),
        this.prisma.user.count(),
        this.prisma.productCategory.count(),
        this.prisma.coupon.count({ where: { isActive: true } }),
        this.prisma.order.count(),
        this.prisma.order.count({ where: { status: 'PENDING' } }),
        this.prisma.returnRequest.count({
          where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
        }),
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
        totalOrders,
        pendingOrders,
        pendingReturns,
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
