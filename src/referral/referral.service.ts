import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Get or create referral code for user ─────────────────────────────────

  async getOrCreateCode(userId: string) {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId } });
    if (existing) return existing;

    const code = await this.generateUniqueCode(userId);
    return this.prisma.referralCode.create({ data: { userId, code } });
  }

  // ── Apply referral code during registration ───────────────────────────────

  async applyReferralCode(referredUserId: string, code: string): Promise<void> {
    const referralCode = await this.prisma.referralCode.findUnique({ where: { code } });
    if (!referralCode) throw new NotFoundException('Invalid referral code');
    if (referralCode.userId === referredUserId) return; // can't refer yourself

    // Check if already referred
    const existing = await this.prisma.referral.findUnique({ where: { referredUserId } });
    if (existing) return;

    await this.prisma.referral.create({
      data: { referralCodeId: referralCode.id, referredUserId },
    });

    await this.prisma.referralCode.update({
      where: { id: referralCode.id },
      data: { timesUsed: { increment: 1 } },
    });
  }

  // ── Complete referral when referred user places first order ───────────────

  async completeReferral(referredUserId: string, orderId: string): Promise<string | null> {
    const referral = await this.prisma.referral.findUnique({
      where: { referredUserId },
      include: { referralCode: true },
    });

    if (!referral || referral.rewardGiven) return null;

    await this.prisma.referral.update({
      where: { id: referral.id },
      data: { rewardGiven: true, orderId },
    });

    return referral.referralCode.userId; // referrer's userId
  }

  // ── Get referral stats for user ───────────────────────────────────────────

  async getStats(userId: string) {
    const code = await this.prisma.referralCode.findUnique({
      where: { userId },
      include: {
        referrals: {
          include: { referredUser: { select: { name: true, createdAt: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return code;
  }

  // ── Admin: list all referral codes ───────────────────────────────────────

  async listAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.referralCode.findMany({
        skip,
        take: limit,
        orderBy: { timesUsed: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          _count: { select: { referrals: true } },
        },
      }),
      this.prisma.referralCode.count(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async generateUniqueCode(userId: string): Promise<string> {
    // Try user-name based code first
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const base = (user?.name ?? 'DC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    let code = base + randomBytes(2).toString('hex').toUpperCase();

    // Ensure uniqueness
    let attempts = 0;
    while (await this.prisma.referralCode.findUnique({ where: { code } })) {
      code = base + randomBytes(3).toString('hex').toUpperCase();
      if (++attempts > 10) code = randomBytes(5).toString('hex').toUpperCase();
    }
    return code;
  }
}
