import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

interface CartLine {
  lineId: string;
  productId: string;
  variantId: string;
  categoryId?: string;
  name: string;
  slug: string;
  image?: string | null;
  size: string;
  color: string;
  unitPrice: number;
  quantity: number;
}

export interface StoredCart {
  lines: CartLine[];
  couponCode: string | null;
  couponDiscount: number;
}

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notification: NotificationService,
  ) {}

  async loadCart(userId: string): Promise<StoredCart> {
    const record = await this.prisma.abandonedCart.findUnique({ where: { userId } });
    if (!record) return { lines: [], couponCode: null, couponDiscount: 0 };
    const stored = record.items as unknown as StoredCart;
    // Handle legacy format (array of items before migration)
    if (Array.isArray(stored)) return { lines: [], couponCode: null, couponDiscount: 0 };
    return {
      lines: stored.lines ?? [],
      couponCode: stored.couponCode ?? null,
      couponDiscount: stored.couponDiscount ?? 0,
    };
  }

  async saveCart(
    userId: string,
    lines: CartLine[],
    couponCode: string | null,
    couponDiscount: number,
  ) {
    const payload: StoredCart = { lines, couponCode, couponDiscount };
    if (!lines.length) {
      await this.prisma.abandonedCart.deleteMany({ where: { userId } });
      return;
    }
    return this.prisma.abandonedCart.upsert({
      where: { userId },
      create: { userId, items: payload as unknown as any, emailSentAt: null },
      update: { items: payload as unknown as any, emailSentAt: null },
    });
  }

  async clearCart(userId: string) {
    await this.prisma.abandonedCart.deleteMany({ where: { userId } });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processAbandonedCarts() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const carts = await this.prisma.abandonedCart.findMany({
      where: { updatedAt: { lte: twoHoursAgo }, emailSentAt: null },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    this.logger.log(`Abandoned cart cron: found ${carts.length} carts to process`);

    for (const cart of carts) {
      if (!cart.user.email) continue;
      const stored = cart.items as unknown as StoredCart;
      const lines: CartLine[] = Array.isArray(stored) ? (stored as unknown as CartLine[]) : (stored.lines ?? []);
      if (!lines.length) continue;
      try {
        await this.notification.sendAbandonedCartEmail(
          cart.user.email,
          cart.user.name,
          lines.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice })),
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
