import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async purchaseGiftCard(
    purchasedById: string | null,
    dto: { amount: number; recipientEmail: string; recipientName?: string; message?: string },
  ) {
    if (dto.amount < 50) throw new BadRequestException('Minimum gift card amount is ₹50');
    if (dto.amount > 10000) throw new BadRequestException('Maximum gift card amount is ₹10,000');

    // Generate unique code
    let code: string;
    let attempts = 0;
    do {
      code = generateGiftCardCode();
      const existing = await this.prisma.giftCard.findUnique({ where: { code } });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const amount = new Prisma.Decimal(dto.amount);

    const giftCard = await this.prisma.giftCard.create({
      data: {
        code,
        initialAmount: amount,
        balance: amount,
        purchasedById,
        recipientEmail: dto.recipientEmail,
        recipientName: dto.recipientName,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });

    // Send email to recipient
    this.mail.sendRaw({
      to: dto.recipientEmail,
      subject: `You received a ₹${dto.amount} Gift Card! 🎁 | Disent Club`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#4338ca">You've received a Gift Card! 🎁</h2>
          ${dto.recipientName ? `<p>Hi ${dto.recipientName},</p>` : ''}
          <p>Someone special sent you a <strong>₹${dto.amount}</strong> Disent Club Gift Card.</p>
          ${dto.message ? `<blockquote style="border-left:3px solid #4338ca;padding-left:12px;color:#555">${dto.message}</blockquote>` : ''}
          <div style="background:#f5f3ff;border-radius:12px;padding:20px;text-align:center;margin:20px 0">
            <p style="font-size:12px;color:#888;margin:0">Your Gift Card Code</p>
            <p style="font-size:28px;font-weight:900;letter-spacing:4px;color:#1e1b4b;margin:8px 0">${code}</p>
            <p style="font-size:12px;color:#888;margin:0">Balance: ₹${dto.amount} · Valid for 1 year</p>
          </div>
          <p>Use this code at checkout on <a href="https://disentclub.com">disentclub.com</a></p>
        </div>
      `,
      text: `You received a ₹${dto.amount} Disent Club Gift Card! Code: ${code}${dto.message ? `. Message: ${dto.message}` : ''}`,
    }).catch((err: Error) => console.error('[Gift Card Mail]', err?.message));

    return {
      id: giftCard.id,
      code: giftCard.code,
      initialAmount: Number(giftCard.initialAmount),
      balance: Number(giftCard.balance),
      recipientEmail: giftCard.recipientEmail,
      expiresAt: giftCard.expiresAt,
    };
  }

  async checkGiftCard(code: string) {
    const card = await this.prisma.giftCard.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!card) throw new NotFoundException('Gift card not found');
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
      where: { purchasedById: userId },
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { purchasedBy: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.giftCard.count(),
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

  /** Apply gift card to an order — returns the discount amount actually applied. */
  async applyToOrder(code: string, maxAmount: number): Promise<{ discountAmount: number; giftCardId: string }> {
    const card = await this.prisma.giftCard.findUnique({ where: { code: code.toUpperCase().trim() } });
    if (!card || !card.isActive) throw new BadRequestException('Invalid or inactive gift card');
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
