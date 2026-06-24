import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { Prisma } from '@prisma/client';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { resolveSiteUrl } from '../common/site.constants';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateGiftCardCode(length = 12): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

@Injectable()
export class GiftCardService {
  private readonly razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
  }

  // ── Step 1: Create Razorpay order, save pending gift card ────────────────
  async initiateGiftCardPurchase(
    purchasedById: string,
    dto: { amount: number; recipientEmail: string; recipientName?: string; message?: string },
  ) {
    if (dto.amount < 50) throw new BadRequestException('Minimum gift card amount is ₹50');
    if (dto.amount > 10000) throw new BadRequestException('Maximum gift card amount is ₹10,000');

    // Generate unique code (reserved but not active yet)
    let code: string;
    let attempts = 0;
    do {
      code = generateGiftCardCode();
      const existing = await this.prisma.giftCard.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    // Create Razorpay order
    const amountPaise = Math.round(dto.amount * 100);
    const rpOrder = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `gc_${Date.now()}`,
    });

    // Save pending gift card (isActive=false, isPaid=false until payment verified)
    const giftCard = await this.prisma.giftCard.create({
      data: {
        code,
        initialAmount: new Prisma.Decimal(dto.amount),
        balance: new Prisma.Decimal(dto.amount),
        purchasedById,
        recipientEmail: dto.recipientEmail,
        recipientName: dto.recipientName,
        message: dto.message,
        isActive: false,
        isPaid: false,
        razorpayOrderId: rpOrder.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      giftCardId: giftCard.id,
      razorpayOrderId: rpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
    };
  }

  // ── Step 2: Verify Razorpay signature → activate gift card → send email ──
  async verifyGiftCardPayment(dto: {
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }) {
    const giftCard = await this.prisma.giftCard.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
    });

    if (!giftCard) throw new NotFoundException('Gift card order not found');
    if (giftCard.isPaid) {
      return { message: 'Already paid', code: giftCard.code, giftCardId: giftCard.id };
    }

    // Verify HMAC signature
    const keySecret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const expectedSig = createHmac('sha256', keySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSig !== dto.razorpaySignature) {
      throw new BadRequestException('Payment verification failed: invalid signature');
    }

    // Activate the gift card
    const activated = await this.prisma.giftCard.update({
      where: { id: giftCard.id },
      data: {
        isActive: true,
        isPaid: true,
        razorpayPaymentId: dto.razorpayPaymentId,
      },
    });

    // Send email to recipient
    const siteUrl = resolveSiteUrl(this.config.get<string>('NEXT_PUBLIC_SITE_URL'));
    const siteDomain = siteUrl.replace(/^https?:\/\//, '');
    this.mail.sendRaw({
      to: activated.recipientEmail,
      subject: `You received a ₹${Number(activated.initialAmount)} Gift Card! | Disent Club`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#4338ca">You received a Gift Card!</h2>
          ${activated.recipientName ? `<p>Hi ${activated.recipientName},</p>` : ''}
          <p>Someone special sent you a <strong>&#8377;${Number(activated.initialAmount)}</strong> Disent Club Gift Card.</p>
          ${activated.message ? `<blockquote style="border-left:3px solid #4338ca;padding-left:12px;color:#555">${activated.message}</blockquote>` : ''}
          <div style="background:#f5f3ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
            <p style="font-size:12px;color:#888;margin:0">Your Gift Card Code</p>
            <p style="font-size:28px;font-weight:900;letter-spacing:4px;color:#1e1b4b;margin:8px 0">${activated.code}</p>
            <p style="font-size:12px;color:#888;margin:0">Balance: &#8377;${Number(activated.initialAmount)} &middot; Valid for 1 year</p>
          </div>
          <p>Use this code at checkout on <a href="${siteUrl}" style="color:#4338ca">${siteDomain}</a></p>
        </div>
      `,
      text: `You received a Rs.${Number(activated.initialAmount)} Disent Club Gift Card! Code: ${activated.code}${activated.message ? `. Message: ${activated.message}` : ''}. Shop at ${siteUrl}`,
    }).catch((err: Error) => console.error('[Gift Card Mail]', err?.message));

    return {
      message: 'Payment verified. Gift card activated and sent.',
      code: activated.code,
      giftCardId: activated.id,
      recipientEmail: activated.recipientEmail,
    };
  }

  async checkGiftCard(code: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!card) throw new NotFoundException('Gift card not found');
    if (!card.isPaid) throw new BadRequestException('Gift card payment not completed');
    if (!card.isActive) throw new BadRequestException('Gift card has been deactivated');
    if (card.expiresAt && card.expiresAt < new Date()) throw new BadRequestException('Gift card has expired');
    if (Number(card.balance) <= 0) throw new BadRequestException('Gift card has no remaining balance');
    return {
      code: card.code,
      initialAmount: Number(card.initialAmount),
      balance: Number(card.balance),
      expiresAt: card.expiresAt,
      isValid: true,
    };
  }

  async getMyGiftCards(userId: string) {
    const cards = await this.prisma.giftCard.findMany({
      where: { purchasedById: userId, isPaid: true },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map((c) => ({
      id: c.id,
      code: c.code,
      initialAmount: Number(c.initialAmount),
      balance: Number(c.balance),
      recipientEmail: c.recipientEmail,
      recipientName: c.recipientName,
      isActive: c.isActive,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
  }

  async adminListGiftCards(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.giftCard.findMany({
        where: { isPaid: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { purchasedBy: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.giftCard.count({ where: { isPaid: true } }),
    ]);
    return {
      items: items.map((c) => ({
        id: c.id,
        code: c.code,
        initialAmount: Number(c.initialAmount),
        balance: Number(c.balance),
        recipientEmail: c.recipientEmail,
        recipientName: c.recipientName,
        isActive: c.isActive,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        purchasedBy: c.purchasedBy,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async deactivateGiftCard(id: string) {
    const card = await this.prisma.giftCard.update({ where: { id }, data: { isActive: false } });
    return { id: card.id, isActive: card.isActive };
  }

  /** Apply gift card to an order — returns the discount amount actually applied. */
  async applyToOrder(code: string, maxAmount: number): Promise<{ discountAmount: number; giftCardId: string }> {
    const card = await this.prisma.giftCard.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!card || !card.isActive || !card.isPaid) throw new BadRequestException('Invalid or inactive gift card');
    if (card.expiresAt && card.expiresAt < new Date()) throw new BadRequestException('Gift card has expired');
    const available = Number(card.balance);
    if (available <= 0) throw new BadRequestException('Gift card has no balance');
    const discountAmount = Math.min(available, maxAmount);
    return { discountAmount, giftCardId: card.id };
  }

  /** Deduct from gift card balance after order is placed. */
  async deductBalance(giftCardId: string, amount: number) {
    const card = await this.prisma.giftCard.findUnique({ where: { id: giftCardId } });
    if (!card) return;
    const newBalance = Math.max(0, Number(card.balance) - amount);
    await this.prisma.giftCard.update({
      where: { id: giftCardId },
      data: {
        balance: new Prisma.Decimal(newBalance),
        redeemedAt: new Date(),
        isActive: newBalance > 0,
      },
    });
  }
}
