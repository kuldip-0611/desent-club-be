import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StoreCreditTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoreCreditService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Get or create account ─────────────────────────────────────────────────

  async getAccount(userId: string) {
    return this.prisma.storeCredit.upsert({
      where: { userId },
      create: { userId, balance: 0, totalEarned: 0, totalUsed: 0 },
      update: {},
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  async getBalance(userId: string): Promise<number> {
    const credit = await this.prisma.storeCredit.findUnique({ where: { userId } });
    return Number(credit?.balance ?? 0);
  }

  // ── Add credit from return ────────────────────────────────────────────────

  async addFromReturn(userId: string, amount: number, returnId: string, orderId: string): Promise<void> {
    if (amount <= 0) return;
    await this.prisma.$transaction([
      this.prisma.storeCredit.upsert({
        where: { userId },
        create: { userId, balance: amount, totalEarned: amount, totalUsed: 0 },
        update: {
          balance: { increment: amount },
          totalEarned: { increment: amount },
        },
      }),
      this.prisma.storeCreditTx.create({
        data: {
          credit: { connect: { userId } },
          amount,
          type: StoreCreditTxType.EARNED,
          description: `Store credit from return #${orderId.slice(-8).toUpperCase()}`,
          returnId,
          orderId,
        },
      }),
    ]);
  }

  // ── Apply credit at checkout ──────────────────────────────────────────────

  async applyCredit(userId: string, requestedAmount: number, orderId: string): Promise<number> {
    const balance = await this.getBalance(userId);
    if (balance <= 0) throw new BadRequestException('No store credit available');

    const applied = Math.min(requestedAmount, balance);

    await this.prisma.$transaction([
      this.prisma.storeCredit.update({
        where: { userId },
        data: {
          balance: { decrement: applied },
          totalUsed: { increment: applied },
        },
      }),
      this.prisma.storeCreditTx.create({
        data: {
          credit: { connect: { userId } },
          amount: -applied,
          type: StoreCreditTxType.USED,
          description: `Applied to order #${orderId.slice(-8).toUpperCase()}`,
          orderId,
        },
      }),
    ]);

    return applied;
  }

  // ── Validate how much credit can be applied to an order ──────────────────
  // Max 100% of order total (store credit covers full amount unlike loyalty)

  async getApplicableAmount(userId: string, orderTotal: number): Promise<{
    balance: number;
    applicable: number;
    saving: number;
  }> {
    const balance = await this.getBalance(userId);
    const applicable = Math.min(balance, orderTotal);
    return { balance, applicable, saving: applicable };
  }
}
