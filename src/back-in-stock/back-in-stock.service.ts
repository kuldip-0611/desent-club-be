import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class BackInStockService {
  private readonly logger = new Logger(BackInStockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async subscribe(
    productId: string,
    email: string,
    size?: string,
    userId?: string,
  ): Promise<{ message: string }> {
    const existing = await this.prisma.backInStockAlert.findFirst({
      where: { productId, email, size: size ?? null },
    });
    if (existing) {
      await this.prisma.backInStockAlert.update({
        where: { id: existing.id },
        data: { notifiedAt: null },
      });
    } else {
      await this.prisma.backInStockAlert.create({
        data: {
          productId,
          email,
          size: size ?? null,
          userId: userId ?? null,
        },
      });
    }
    return { message: 'You will be notified when this product is back in stock' };
  }

  async notifySubscribers(productId: string): Promise<void> {
    const alerts = await this.prisma.backInStockAlert.findMany({
      where: { productId, notifiedAt: null },
      include: { product: { select: { name: true } } },
    });

    if (!alerts.length) return;

    for (const alert of alerts) {
      try {
        await this.notification.sendBackInStockEmail(alert.email, alert.product.name, productId);
        await this.prisma.backInStockAlert.update({
          where: { id: alert.id },
          data: { notifiedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to notify ${alert.email} for product ${productId}: ${err}`);
      }
    }
  }

  async getAlerts(productId: string) {
    return this.prisma.backInStockAlert.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
