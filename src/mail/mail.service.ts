import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { resolveSiteUrl } from '../common/site.constants';
import { buildOrderConfirmationEmail } from './templates/order-confirmation.template';
import { buildOrderShippedEmail } from './templates/order-shipped.template';
import { buildOrderDeliveredEmail } from './templates/order-delivered.template';
import { buildRefundProcessedEmail } from './templates/refund-processed.template';
import { buildReturnApprovedEmail } from './templates/return-approved.template';
import { buildOrderCancelledEmail } from './templates/order-cancelled.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {}

  // ── Private helpers ──────────────────────────────────────────────────────────

  private get from(): string {
    return this.config.get<string>('RESEND_FROM') ?? 'Desent Club <testinfo@disentclub.com>';
  }

  private get siteUrl(): string {
    return resolveSiteUrl(this.config.get<string>('NEXT_PUBLIC_SITE_URL'));
  }

  private getResend(): Resend | null {
    if (this.resend) return this.resend;
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    if (!apiKey || apiKey === 'YOUR_NEW_KEY_HERE') return null;
    this.resend = new Resend(apiKey);
    return this.resend;
  }

  async sendRaw(opts: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<void> {
    await this.send(opts.to, opts.subject, opts.html, opts.text);
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    const resend = this.getResend();
    if (!resend) {
      this.logger.log(
        `[DEV] Email to ${to} — "${subject}" (set RESEND_API_KEY to send real email)\n${text ?? ''}`,
      );
      return;
    }
    try {
      const { error } = await resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        ...(text ? { text } : {}),
      });
      if (error) {
        this.logger.error(`Resend error to ${to}: ${JSON.stringify(error)}`);
        throw new Error(error.message);
      }
      this.logger.log(`Email sent to ${to} — "${subject}"`);
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error)?.message}`);
      throw err;
    }
  }

  // ── Order Confirmation ───────────────────────────────────────────────────────

  async sendOrderConfirmation(opts: {
    to: string;
    name: string;
    orderId: string;
    items: Array<{
      name: string;
      size?: string | null;
      color?: string | null;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
    subtotal: number;
    discountAmount?: number;
    couponCode?: string | null;
    total: number;
    paymentMethod: 'ONLINE' | 'COD';
    shippingAddress?: {
      fullName?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      pincode?: string;
      phone?: string;
    } | null;
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const html = buildOrderConfirmationEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(opts.to, `Order Confirmed — #${ref} | Desent Club`, html);
  }

  // ── Order Shipped ────────────────────────────────────────────────────────────

  async sendOrderShipped(opts: {
    to: string;
    name: string;
    orderId: string;
    courierName: string;
    awbCode: string;
    trackingUrl?: string | null;
    estimatedDelivery?: string;
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const html = buildOrderShippedEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(opts.to, `Your Order #${ref} has Shipped! 🚚 | Desent Club`, html);
  }

  // ── Order Delivered ──────────────────────────────────────────────────────────

  async sendOrderDelivered(opts: {
    to: string;
    name: string;
    orderId: string;
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const html = buildOrderDeliveredEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(opts.to, `Order Delivered — #${ref} ✅ | Desent Club`, html);
  }

  // ── Refund Processed ─────────────────────────────────────────────────────────

  async sendRefundProcessed(opts: {
    to: string;
    name: string;
    orderId: string;
    amount: number;
    refundId?: string | null;
    paymentMethod: 'ONLINE' | 'COD';
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const html = buildRefundProcessedEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(opts.to, `Refund Processed for Order #${ref} | Desent Club`, html);
  }

  // ── Return / Exchange Approved ────────────────────────────────────────────────

  async sendReturnApproved(opts: {
    to: string;
    name: string;
    orderId: string;
    awbCode?: string | null;
    courierName?: string | null;
    returnType: 'RETURN' | 'EXCHANGE';
    exchangeSize?: string | null;
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const isExchange = opts.returnType === 'EXCHANGE';
    const html = buildReturnApprovedEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(
      opts.to,
      `${isExchange ? 'Exchange' : 'Return'} Approved for Order #${ref} | Desent Club`,
      html,
    );
  }

  // ── Order Cancelled ───────────────────────────────────────────────────────────

  async sendOrderCancelled(opts: {
    to: string;
    name: string;
    orderId: string;
    reason?: string;
    total: number;
    paymentMethod: 'ONLINE' | 'COD';
  }): Promise<void> {
    const ref = opts.orderId.slice(-8).toUpperCase();
    const html = buildOrderCancelledEmail({ ...opts, siteUrl: this.siteUrl });
    await this.send(opts.to, `Order #${ref} Cancelled | Desent Club`, html);
  }
}
