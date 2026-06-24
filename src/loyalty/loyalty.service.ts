import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyTxType } from '@prisma/client';

// Fallback defaults (used only if DB row doesn't exist yet)
export const LOYALTY_DEFAULTS = {
  pointsPerRupee: 1,
  rupeePerPoint: 0.25,
  minRedeemPoints: 100,
  maxRedeemPercent: 20,
  referralBonus: 100,
  referredBonus: 50,
  orderEarnMultiplier: 1,
};

// Keep LOYALTY_RULES export for any code that still references it (order.service etc.)
// It now acts as the fallback; runtime always reads from DB.
export const LOYALTY_RULES = LOYALTY_DEFAULTS;

export type LoyaltySettings = typeof LOYALTY_DEFAULTS;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Settings (admin-configurable) ─────────────────────────────────────────

  async getSettings(): Promise<LoyaltySettings> {
    const row = await this.prisma.loyaltySetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...LOYALTY_DEFAULTS },
      update: {},
    });
    return {
      pointsPerRupee: row.pointsPerRupee,
      rupeePerPoint: row.rupeePerPoint,
      minRedeemPoints: row.minRedeemPoints,
      maxRedeemPercent: row.maxRedeemPercent,
      referralBonus: row.referralBonus,
      referredBonus: row.referredBonus,
      orderEarnMultiplier: row.orderEarnMultiplier,
    };
  }

  async updateSettings(data: Partial<LoyaltySettings>): Promise<LoyaltySettings> {
    const row = await this.prisma.loyaltySetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...LOYALTY_DEFAULTS, ...data },
      update: data,
    });
    this.logger.log(`Loyalty settings updated: ${JSON.stringify(data)}`);
    return {
      pointsPerRupee: row.pointsPerRupee,
      rupeePerPoint: row.rupeePerPoint,
      minRedeemPoints: row.minRedeemPoints,
      maxRedeemPercent: row.maxRedeemPercent,
      referralBonus: row.referralBonus,
      referredBonus: row.referredBonus,
      orderEarnMultiplier: row.orderEarnMultiplier,
    };
  }

  // ── Get or create account ─────────────────────────────────────────────────

  async getAccount(userId: string) {
    return this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId, balance: 0, totalEarned: 0, totalRedeemed: 0 },
      update: {},
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
  }

  async getBalance(userId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
    return account?.balance ?? 0;
  }

  // ── Earn points on order ──────────────────────────────────────────────────

  async earnOnOrder(userId: string, orderId: string, orderTotal: number): Promise<number> {
    const rules = await this.getSettings();
    const points = Math.floor(orderTotal * rules.pointsPerRupee * rules.orderEarnMultiplier);
    if (points <= 0) return 0;

    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.upsert({
        where: { userId },
        create: { userId, balance: points, totalEarned: points, totalRedeemed: 0 },
        update: { balance: { increment: points }, totalEarned: { increment: points } },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          account: { connect: { userId } },
          type: LoyaltyTxType.EARNED,
          points,
          description: `Earned on order #${orderId.slice(-8).toUpperCase()}`,
          orderId,
        },
      }),
    ]);

    this.logger.log(`User ${userId} earned ${points} points on order ${orderId}`);
    return points;
  }

  // ── Reverse points on order cancellation ─────────────────────────────────

  async reverseOrderPoints(userId: string, orderId: string): Promise<void> {
    // Find all loyalty transactions for this order
    const txns = await this.prisma.loyaltyTransaction.findMany({
      where: { orderId, account: { userId } },
    });
    if (!txns.length) return;

    // Net points to reverse: earned - already-redeemed adjustments for this order
    const netEarned = txns
      .filter((t) => t.type === LoyaltyTxType.EARNED)
      .reduce((sum, t) => sum + t.points, 0);
    const netRedeemed = txns
      .filter((t) => t.type === LoyaltyTxType.REDEEMED)
      .reduce((sum, t) => sum + Math.abs(t.points), 0);

    const ops: Promise<unknown>[] = [];

    if (netEarned > 0) {
      // Deduct earned points (capped so balance doesn't go negative)
      const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
      const deduct = Math.min(netEarned, account?.balance ?? 0);
      if (deduct > 0) {
        ops.push(
          this.prisma.loyaltyAccount.update({
            where: { userId },
            data: { balance: { decrement: deduct }, totalEarned: { decrement: deduct } },
          }),
          this.prisma.loyaltyTransaction.create({
            data: {
              account: { connect: { userId } },
              type: LoyaltyTxType.ADJUSTED,
              points: -deduct,
              description: `Points reversed — order #${orderId.slice(-8).toUpperCase()} cancelled`,
              orderId,
            },
          }),
        );
      }
    }

    if (netRedeemed > 0) {
      // Restore redeemed points back to the balance
      ops.push(
        this.prisma.loyaltyAccount.update({
          where: { userId },
          data: { balance: { increment: netRedeemed }, totalRedeemed: { decrement: netRedeemed } },
        }),
        this.prisma.loyaltyTransaction.create({
          data: {
            account: { connect: { userId } },
            type: LoyaltyTxType.ADJUSTED,
            points: netRedeemed,
            description: `Redeemed points restored — order #${orderId.slice(-8).toUpperCase()} cancelled`,
            orderId,
          },
        }),
      );
    }

    if (ops.length) await Promise.all(ops);
    this.logger.log(`Loyalty reversed for user ${userId} on cancelled order ${orderId} (earned=${netEarned}, redeemed=${netRedeemed})`);
  }

  // ── Redeem points at checkout ─────────────────────────────────────────────

  async redeemPoints(userId: string, points: number, orderId: string): Promise<number> {
    const rules = await this.getSettings();
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
    if (!account || account.balance < points || points < rules.minRedeemPoints) {
      throw new Error('Insufficient loyalty points');
    }

    const discount = points * rules.rupeePerPoint;

    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { userId },
        data: { balance: { decrement: points }, totalRedeemed: { increment: points } },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          account: { connect: { userId } },
          type: LoyaltyTxType.REDEEMED,
          points: -points,
          description: `Redeemed on order #${orderId.slice(-8).toUpperCase()}`,
          orderId,
        },
      }),
    ]);

    return discount;
  }

  // ── Referral bonus ────────────────────────────────────────────────────────

  async giveReferralBonus(referrerId: string, referredUserId: string): Promise<void> {
    const rules = await this.getSettings();
    await Promise.all([
      this.addPoints(referrerId, rules.referralBonus, LoyaltyTxType.REFERRAL, 'Referral bonus — friend placed first order'),
      this.addPoints(referredUserId, rules.referredBonus, LoyaltyTxType.REFERRAL, 'Welcome bonus — joined via referral'),
    ]);
  }

  // ── Admin: adjust points ──────────────────────────────────────────────────

  async adjustPoints(
    userId: string,
    points: number,
    reason: string,
    adminNote?: string,
  ): Promise<{
    userId: string;
    previousBalance: number;
    adjustedBy: number;
    newBalance: number;
    transactionId: string;
  }> {
    if (points === 0) {
      throw new BadRequestException('Points adjustment cannot be zero');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const account = await this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId, balance: 0, totalEarned: 0, totalRedeemed: 0 },
      update: {},
    });

    const previousBalance = account.balance;

    if (points < 0 && Math.abs(points) > previousBalance) {
      throw new BadRequestException(
        `Cannot deduct ${Math.abs(points)} points. User only has ${previousBalance} points.`,
      );
    }

    const newBalance = previousBalance + points;
    const description = adminNote ? `${reason} (Admin note: ${adminNote})` : reason;

    const [, tx] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { userId },
        data: {
          balance: { increment: points },
          ...(points > 0
            ? { totalEarned: { increment: points } }
            : { totalRedeemed: { increment: Math.abs(points) } }),
        },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          account: { connect: { userId } },
          type: LoyaltyTxType.ADJUSTED,
          points,
          description,
        },
      }),
    ]);

    this.logger.log(
      `[Admin] Adjusted ${points > 0 ? '+' : ''}${points} pts for user ${userId} (${user.name}). ` +
      `${previousBalance} → ${newBalance}. Reason: ${reason}`,
    );

    return { userId, previousBalance, adjustedBy: points, newBalance, transactionId: tx.id };
  }

  // ── Admin: get all accounts ───────────────────────────────────────────────

  async listAccounts(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.loyaltyAccount.findMany({
        skip,
        take: limit,
        orderBy: { balance: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.loyaltyAccount.count(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async addPoints(userId: string, points: number, type: LoyaltyTxType, description: string): Promise<void> {
    if (points === 0) return;
    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.upsert({
        where: { userId },
        create: { userId, balance: Math.max(0, points), totalEarned: Math.max(0, points), totalRedeemed: 0 },
        update: {
          balance: { increment: points },
          ...(points > 0 ? { totalEarned: { increment: points } } : { totalRedeemed: { increment: Math.abs(points) } }),
        },
      }),
      this.prisma.loyaltyTransaction.create({
        data: { account: { connect: { userId } }, type, points, description },
      }),
    ]);
  }
}
