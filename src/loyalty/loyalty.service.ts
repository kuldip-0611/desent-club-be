import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoyaltyTxType } from '@prisma/client';

export const LOYALTY_RULES = {
  pointsPerRupee: 1,        // 1 point per ₹1 spent
  rupeePerPoint: 0.25,      // 1 point = ₹0.25 when redeeming
  minRedeemPoints: 100,     // minimum 100 points to redeem
  maxRedeemPercent: 20,     // max 20% of order value via points
  referralBonus: 100,       // points for referrer when referred user places first order
  referredBonus: 50,        // points for new user who used referral code
  orderEarnMultiplier: 1,   // can boost during events
};

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    const points = Math.floor(orderTotal * LOYALTY_RULES.pointsPerRupee * LOYALTY_RULES.orderEarnMultiplier);
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

  // ── Redeem points at checkout ─────────────────────────────────────────────

  async redeemPoints(userId: string, points: number, orderId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({ where: { userId } });
    if (!account || account.balance < points || points < LOYALTY_RULES.minRedeemPoints) {
      throw new Error('Insufficient loyalty points');
    }

    const discount = points * LOYALTY_RULES.rupeePerPoint;

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
    await Promise.all([
      this.addPoints(referrerId, LOYALTY_RULES.referralBonus, LoyaltyTxType.REFERRAL, 'Referral bonus — friend placed first order'),
      this.addPoints(referredUserId, LOYALTY_RULES.referredBonus, LoyaltyTxType.REFERRAL, 'Welcome bonus — joined via referral'),
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

    // Verify user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    // Get or create loyalty account to check current balance
    const account = await this.prisma.loyaltyAccount.upsert({
      where: { userId },
      create: { userId, balance: 0, totalEarned: 0, totalRedeemed: 0 },
      update: {},
    });

    const previousBalance = account.balance;

    // Guard: cannot deduct more than current balance
    if (points < 0 && Math.abs(points) > previousBalance) {
      throw new BadRequestException(
        `Cannot deduct ${Math.abs(points)} points. User only has ${previousBalance} points.`,
      );
    }

    const newBalance = previousBalance + points;
    const description = adminNote
      ? `${reason} (Admin note: ${adminNote})`
      : reason;

    const [, tx] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { userId },
        data: {
          balance: { increment: points },
          // Track totals correctly
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

    return {
      userId,
      previousBalance,
      adjustedBy: points,
      newBalance,
      transactionId: tx.id,
    };
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
        data: {
          account: { connect: { userId } },
          type,
          points,
          description,
        },
      }),
    ]);
  }

  // ── Admin: get all accounts with stats ───────────────────────────────────

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
}
