import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  buildDirectCouponEmail,
  buildGroupCouponEmail,
  buildNewCouponEmail,
} from './templates/coupon-notification.template';
import { buildOrderConfirmationEmail } from './templates/order-confirmation.template';

interface CouponPayload {
  code: string;
  discountType: string;
  value: string;
  minSubtotal?: string | null;
  maxDiscount?: string | null;
  endsAt?: Date | null;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  /**
   * Called after a public coupon is created.
   * Sends an email to all users who have an email address.
   * Fires asynchronously — does not block the API response.
   */
  notifyAllUsersNewCoupon(coupon: CouponPayload): void {
    this.sendToAllUsers(coupon).catch((err) => {
      this.logger.error(`Failed broadcasting new coupon email: ${err}`);
    });
    // Push: get all FCM tokens and fan-out
    this.pushNewCouponToAll(coupon).catch((err) => {
      this.logger.error(`Failed broadcasting new coupon push: ${err}`);
    });
  }

  /**
   * Called after a coupon is directly assigned to a specific user.
   */
  notifyUserCouponAssigned(
    user: { email: string | null; name: string | null; fcmToken?: string | null },
    coupon: CouponPayload,
  ): void {
    if (user.email) {
      const { subject, text, html } = buildDirectCouponEmail(user.name ?? '', coupon);
      this.send(user.email, subject, text, html).catch((err) => {
        this.logger.error(`Failed sending direct coupon email to ${user.email}: ${err}`);
      });
    }
    if (user.fcmToken) {
      this.firebase
        .sendToToken(user.fcmToken, {
          title: '🎉 You got a coupon!',
          body: `Use code ${coupon.code} for ${coupon.discountType === 'PERCENT' ? coupon.value + '% off' : '₹' + coupon.value + ' off'}`,
        })
        .catch(() => undefined);
    }
  }

  /**
   * Called after a coupon is assigned to a user group.
   * Sends an email to every group member who has an email address.
   */
  notifyGroupMembersCouponAssigned(
    members: { email: string | null; name: string | null; fcmToken?: string | null }[],
    groupName: string,
    coupon: CouponPayload,
  ): void {
    const pushTokens: string[] = [];
    for (const member of members) {
      if (member.email) {
        const { subject, text, html } = buildGroupCouponEmail(member.name ?? '', groupName, coupon);
        this.send(member.email, subject, text, html).catch((err) => {
          this.logger.error(`Failed sending group coupon email to ${member.email}: ${err}`);
        });
      }
      if (member.fcmToken) pushTokens.push(member.fcmToken);
    }
    if (pushTokens.length > 0) {
      this.firebase
        .sendToTokens(pushTokens, {
          title: '🎉 Group coupon unlocked!',
          body: `Use code ${coupon.code} for ${coupon.discountType === 'PERCENT' ? coupon.value + '% off' : '₹' + coupon.value + ' off'}`,
        })
        .catch(() => undefined);
    }
  }

  /** Order confirmation email + push after successful payment */
  notifyOrderConfirmed(payload: {
    userEmail: string | null;
    userName: string;
    fcmToken?: string | null;
    orderId: string;
    items: { name: string; size: string; color: string; quantity: number; unitPrice: number; total: number }[];
    subtotal: number;
    discountAmount: number;
    total: number;
    shippingAddress?: Record<string, unknown> | null;
  }): void {
    // Email
    if (payload.userEmail) {
      const { subject, text, html } = buildOrderConfirmationEmail({
        userName: payload.userName,
        orderId: payload.orderId,
        items: payload.items,
        subtotal: payload.subtotal,
        discountAmount: payload.discountAmount,
        total: payload.total,
        shippingAddress: payload.shippingAddress as Parameters<typeof buildOrderConfirmationEmail>[0]['shippingAddress'],
      });
      this.send(payload.userEmail, subject, text, html).catch((err) => {
        this.logger.error(`Failed to send order confirmation email: ${err}`);
      });
    }

    // Push
    if (payload.fcmToken) {
      this.firebase
        .sendToToken(payload.fcmToken, {
          title: '🎉 Order Confirmed!',
          body: `Your order #${payload.orderId.slice(-8).toUpperCase()} is confirmed. Total: ₹${payload.total.toFixed(2)}`,
        })
        .catch(() => undefined);
    }
  }

  /** Push notification when order status changes */
  notifyOrderStatusChanged(
    fcmToken: string | null | undefined,
    orderId: string,
    status: string,
  ): void {
    if (!fcmToken) return;
    const statusLabels: Record<string, string> = {
      CONFIRMED: 'Order confirmed ✅',
      PROCESSING: 'Order is being processed 🔄',
      SHIPPED: 'Your order has shipped 🚚',
      DELIVERED: 'Order delivered 🎉',
      CANCELLED: 'Order cancelled ❌',
    };
    const title = statusLabels[status] ?? `Order status: ${status}`;
    this.firebase
      .sendToToken(fcmToken, { title, body: `Order #${orderId.slice(-8).toUpperCase()}` })
      .catch(() => undefined);
  }

  private async pushNewCouponToAll(coupon: CouponPayload): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { fcmToken: { not: null } },
      select: { fcmToken: true },
    });
    const tokens = users.map((u) => u.fcmToken!).filter(Boolean);
    if (tokens.length === 0) return;
    await this.firebase.sendToTokens(tokens, {
      title: '🏷️ New coupon available!',
      body: `Use code ${coupon.code} for ${coupon.discountType === 'PERCENT' ? coupon.value + '% off' : '₹' + coupon.value + ' off'}`,
    });
  }

  private async sendToAllUsers(coupon: CouponPayload): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { email: { not: null } },
      select: { email: true },
    });

    const { subject, text, html } = buildNewCouponEmail(coupon);

    for (const user of users) {
      if (!user.email) continue;
      await this.send(user.email, subject, text, html).catch((err) => {
        this.logger.warn(`Skipped ${user.email}: ${err}`);
      });
    }
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const smtpUser = this.configService.get<string>('SMTP_USER')?.trim();
    const from =
      this.configService.get<string>('MAIL_FROM')?.trim() ||
      smtpUser ||
      'no-reply@desent.club';

    if (!host) {
      this.logger.log(
        `[DEV] Notification to ${to} — subject: "${subject}" (set SMTP_HOST to send real mail)\n${text}`,
      );
      return;
    }

    const transport = this.getTransporter();
    await transport.sendMail({ from, to, subject, text, html });
    this.logger.log(`Notification email sent to ${to}`);
  }

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const host = this.configService.getOrThrow<string>('SMTP_HOST').trim();
    const port = Number(this.configService.get<string>('SMTP_PORT') ?? 587);
    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const passRaw = this.configService.get<string>('SMTP_PASS')?.trim();
    const pass = passRaw ? passRaw.replace(/\s+/g, '') : undefined;

    const options: SMTPTransport.Options = { host, port, secure };
    if (user && pass) options.auth = { user, pass };

    this.transporter = nodemailer.createTransport(options);
    return this.transporter;
  }
}
