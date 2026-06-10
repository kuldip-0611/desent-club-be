import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  image?: string | null;
  size?: string;
  color?: string;
}

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  /** Called from frontend when user (logged-in) updates their cart */
  async saveCart(userId: string, items: CartItem[]) {
    if (!items.length) {
      await this.prisma.abandonedCart.deleteMany({ where: { userId } });
      return;
    }
    return this.prisma.abandonedCart.upsert({
      where: { userId },
      create: { userId, items: items as unknown as any, emailSentAt: null },
      update: { items: items as unknown as any, emailSentAt: null },
    });
  }

  /** Called when an order is successfully placed — clear the cart record */
  async clearCart(userId: string) {
    await this.prisma.abandonedCart.deleteMany({ where: { userId } });
  }

  /** Cron: every hour — find carts older than 2h with no email sent → send recovery email */
  @Cron(CronExpression.EVERY_HOUR)
  async processAbandonedCarts() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const carts = await this.prisma.abandonedCart.findMany({
      where: {
        updatedAt: { lte: twoHoursAgo },
        emailSentAt: null,
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    });

    this.logger.log(`Abandoned cart cron: found ${carts.length} carts to process`);

    for (const cart of carts) {
      if (!cart.user.email) continue;
      const items = cart.items as unknown as CartItem[];
      try {
        await this.notification.sendAbandonedCartEmail(
          cart.user.email,
          cart.user.name,
          items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        );
        await this.prisma.abandonedCart.update({
          where: { id: cart.id },
          data: { emailSentAt: new Date() },
        });
        this.logger.log(`Abandoned cart email sent to ${cart.user.email}`);
      } catch (err) {
        this.logger.error(`Failed sending abandoned cart email to ${cart.user.email}: ${err}`);
      }
    }
  }
}
