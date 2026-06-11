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

  // ─── Notification Inbox Helpers ──────────────────────────────────────────

  /** Persist a notification to DB for a specific user and optionally push it */
  async persistAndPush(
    userId: string,
    title: string,
    body: string,
    type = 'general',
    fcmToken?: string | null,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { userId, title, body, type, data: data as any },
    });
    if (fcmToken) {
      this.firebase.sendToToken(fcmToken, { title, body }).catch(() => undefined);
    }
  }

  /** List notifications for a user (max 50, newest first) */
  async listForUser(userId: string, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(onlyUnread ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Count unread notifications */
  async countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  /** Mark one notification as read */
  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  /** Mark all notifications as read */
  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /** Delete a notification */
  async deleteOne(id: string, userId: string) {
    return this.prisma.notification.deleteMany({ where: { id, userId } });
  }

  // ─── Admin email alert helpers ────────────────────────────────────────────

  async sendAdminLowStockAlert(productName: string, qty: number): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');
    if (!adminEmail) return;
    const subject = `⚠️ Low stock alert: ${productName}`;
    const text = `Product "${productName}" has only ${qty} unit(s) remaining. Please restock soon.`;
    const html = `<p>Product <strong>${productName}</strong> has only <strong>${qty}</strong> unit(s) remaining.</p><p>Please restock soon.</p>`;
    this.send(adminEmail, subject, text, html).catch((err) =>
      this.logger.error(`Low stock alert failed: ${err}`),
    );
  }

  async sendAdminOrderAlert(
    type: 'new_order' | 'return_request',
    orderId: string,
    userName: string,
    total?: number,
  ): Promise<void> {
    const adminEmail = this.configService.get<string>('ADMIN_ALERT_EMAIL');
    if (!adminEmail) return;
    const ref = orderId.slice(-8).toUpperCase();
    const subject =
      type === 'new_order'
        ? `🛒 New order #${ref} — ₹${(total ?? 0).toFixed(2)}`
        : `↩️ Return request for order #${ref}`;
    const text =
      type === 'new_order'
        ? `New order placed by ${userName}. Order ID: ${orderId}, Total: ₹${(total ?? 0).toFixed(2)}`
        : `Return requested by ${userName} for order ${orderId}`;
    this.send(adminEmail, subject, text, `<p>${text}</p>`).catch(() => undefined);
  }

  async sendAbandonedCartEmail(
    to: string,
    userName: string,
    items: { name: string; quantity: number; unitPrice: number }[],
  ): Promise<void> {
    const subject = `🛒 You left something in your cart — Desent Club`;
    const itemRows = items
      .map((i) => `<li>${i.name} × ${i.quantity} — ₹${(i.unitPrice * i.quantity).toFixed(2)}</li>`)
      .join('');
    const html = `
      <p>Hi ${userName},</p>
      <p>You left some items in your cart at <strong>Desent Club</strong>:</p>
      <ul>${itemRows}</ul>
      <p>Complete your purchase before items sell out!</p>
      <a href="${this.configService.get('NEXT_PUBLIC_SITE_URL') ?? 'https://desenclub.com'}/cart" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">Complete Purchase →</a>
    `;
    const text = `Hi ${userName}, you left ${items.length} item(s) in your Desent Club cart. Visit desenclub.com/cart to complete your purchase.`;
    this.send(to, subject, text, html).catch(() => undefined);
  }

  async sendBackInStockEmail(to: string, productName: string, productId: string): Promise<void> {
    const siteUrl = this.configService.get('NEXT_PUBLIC_SITE_URL') ?? 'https://desenclub.com';
    const subject = `${productName} is back in stock — Desent Club`;
    const html = `
      <p>Great news! <strong>${productName}</strong> is back in stock at Desent Club.</p>
      <p>Grab it before it sells out again!</p>
      <a href="${siteUrl}/products/${productId}" style="background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">Shop Now →</a>
    `;
    const text = `${productName} is back in stock at Desent Club. Visit ${siteUrl}/products/${productId} to shop now.`;
    await this.send(to, subject, text, html);
  }

  // ─── Admin Broadcast ─────────────────────────────────────────────────────

  /**
   * Send a broadcast notification to ALL users:
   * 1. Persist to each user's notification inbox
   * 2. Push via FCM to all users who have an FCM token
   * 3. Optionally send email to all users with an email address
   */
  async broadcastToAll(payload: {
    title: string;
    body: string;
    type?: string;
    data?: Record<string, unknown>;
    sendEmail?: boolean;
  }): Promise<{ sent: number; pushed: number; emailed: number }> {
    const { title, body, type = 'general', data, sendEmail = false } = payload;

    const users = await this.prisma.user.findMany({
      select: { id: true, email: true, fcmToken: true, name: true },
    });

    // 1. Persist to inbox for every user
    await this.prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title, body, type, data: (data ?? {}) as any })),
      skipDuplicates: true,
    });

    // 2. FCM push to users with tokens
    const tokens = users.map((u) => u.fcmToken).filter((t): t is string => Boolean(t));
    let pushed = 0;
    if (tokens.length > 0) {
      await this.firebase.sendToTokens(tokens, { title, body }).catch((err) => {
        this.logger.error(`Broadcast push failed: ${err}`);
      });
      pushed = tokens.length;
    }

    // 3. Optional email blast
    let emailed = 0;
    if (sendEmail) {
      const emailUsers = users.filter((u) => u.email);
      for (const u of emailUsers) {
        const html = `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:28px 32px;border-radius:12px 12px 0 0">
              <p style="color:#fff;font-size:22px;font-weight:800;margin:0">Desent Club</p>
            </div>
            <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="color:#1e293b;font-size:18px;margin:0 0 12px">${title}</h2>
              <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 24px">${body}</p>
              <a href="${this.configService.get('NEXT_PUBLIC_SITE_URL') ?? 'https://desentclub.com'}" style="background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Visit Desent Club →</a>
              <p style="margin-top:24px;font-size:11px;color:#94a3b8">You received this because you have an account at Desent Club.</p>
            </div>
          </div>`;
        await this.send(u.email!, title, body, html).catch(() => undefined);
        emailed++;
      }
    }

    this.logger.log(`Broadcast sent: ${users.length} inbox, ${pushed} push, ${emailed} email`);
    return { sent: users.length, pushed, emailed };
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
