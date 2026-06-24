import { createHmac } from 'crypto';
import { resolveSiteUrl } from '../common/site.constants';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ReturnStatus,
} from '@prisma/client';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CouponService } from '../coupon/coupon.service';
import { ShiprocketService } from '../shiprocket/shiprocket.service';
import { MailService } from '../mail/mail.service';
import { LoyaltyService, LOYALTY_RULES } from '../loyalty/loyalty.service';
import { ReferralService } from '../referral/referral.service';
import { StoreCreditService } from '../store-credit/store-credit.service';
import { GiftCardService } from '../gift-card/gift-card.service';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateReviewsDto } from './dto/create-reviews.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import {
  resolveSupportEmail,
  resolveSupportPhoneDisplay,
} from '../common/support.constants';
import {
  canTransition,
  RETURN_WINDOW_DAYS,
  USER_CANCELLABLE,
} from './order-status.util';

@Injectable()
export class OrderService {
  private readonly razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notification: NotificationService,
    private readonly couponService: CouponService,
    private readonly shiprocket: ShiprocketService,
    private readonly mail: MailService,
    private readonly loyalty: LoyaltyService,
    private readonly referral: ReferralService,
    private readonly storeCredit: StoreCreditService,
    private readonly giftCard: GiftCardService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
  }

  private get supportEmail(): string {
    return resolveSupportEmail(this.config.get<string>('SUPPORT_EMAIL'));
  }

  private get supportPhoneDisplay(): string {
    return resolveSupportPhoneDisplay(this.config.get<string>('SUPPORT_PHONE_DISPLAY'));
  }

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<{
    orderId: string;
    paymentMethod: 'COD' | 'ONLINE';
    razorpayOrderId?: string;
    amount: number;
    currency: string;
    keyId?: string;
    codOtp?: string;
  }> {
    if (!dto.items.length) {
      throw new BadRequestException('Order must contain at least one item');
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('One or more products not found');
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Collect all variant IDs so we can do a single query
    const variantIds = dto.items.map((i) => i.variantId).filter((id): id is string => Boolean(id));
    const variants = variantIds.length
      ? await this.prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;

      if (!product.isAvailable) {
        throw new BadRequestException(`"${product.name}" is not available`);
      }

      // Variant-level stock check (if variant specified)
      if (item.variantId) {
        const variant = variantMap.get(item.variantId);
        if (!variant) {
          throw new BadRequestException(`Selected variant for "${product.name}" was not found`);
        }
        if (variant.quantity < item.quantity) {
          throw new BadRequestException(
            `Only ${variant.quantity} unit(s) of "${product.name}" (${variant.size}${variant.color ? ' / ' + variant.color : ''}) available`,
          );
        }
      } else {
        // Fall back to master product stock
        if (product.quantity < item.quantity) {
          throw new BadRequestException(
            `Only ${product.quantity} unit(s) of "${product.name}" available`,
          );
        }
      }
    }

    let subtotal = new Prisma.Decimal(0);
    const orderItems: {
      productId: string;
      variantId?: string;
      size: string;
      color: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      total: Prisma.Decimal;
    }[] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      const unitPrice = product.price;
      const itemTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.add(itemTotal);
      orderItems.push({
        productId: item.productId,
        variantId: item.variantId,
        size: item.size ?? '',
        color: item.color ?? '',
        quantity: item.quantity,
        unitPrice,
        total: itemTotal,
      });
    }

    let discountAmount = new Prisma.Decimal(0);
    let couponId: string | undefined;

    if (dto.couponCode) {
      // Use the canonical validateForSubtotal which enforces all rules
      // including per-user once-per-coupon limit
      const cartCategoryIds = [...new Set(
        products.map((p) => p.categoryId).filter((id): id is string => Boolean(id)),
      )];
      const couponCheck = await this.couponService.validateForSubtotal(
        dto.couponCode,
        subtotal.toNumber(),
        cartCategoryIds,
        userId,
      );
      if (!couponCheck.valid) {
        throw new BadRequestException(couponCheck.message ?? 'Invalid coupon');
      }
      discountAmount = new Prisma.Decimal(couponCheck.discountAmount);
      couponId = couponCheck.couponId;
    }

    const taxable = Prisma.Decimal.max(subtotal.sub(discountAmount), new Prisma.Decimal(0));
    const shipping = subtotal.gt(1999) ? new Prisma.Decimal(0) : new Prisma.Decimal(99);
    const gstBreakup = this.calculateGst(taxable);
    const gst = gstBreakup.igst; // inter-state default
    let total = taxable.add(shipping).add(gst);

    // Apply loyalty points discount (capped at maxRedeemPercent% of order total)
    let loyaltyPointsToRedeem = 0;
    let loyaltyDiscount = new Prisma.Decimal(0);
    if (dto.loyaltyPoints && dto.loyaltyPoints >= LOYALTY_RULES.minRedeemPoints) {
      const loyaltyBalance = await this.loyalty.getBalance(userId);
      const safePoints = Math.min(dto.loyaltyPoints, loyaltyBalance);
      const maxDiscount = total.mul(LOYALTY_RULES.maxRedeemPercent / 100);
      const potentialDiscount = new Prisma.Decimal(safePoints * LOYALTY_RULES.rupeePerPoint);
      loyaltyDiscount = Prisma.Decimal.min(potentialDiscount, maxDiscount, total);
      loyaltyPointsToRedeem = Math.ceil(loyaltyDiscount.toNumber() / LOYALTY_RULES.rupeePerPoint);
      total = Prisma.Decimal.max(total.sub(loyaltyDiscount), new Prisma.Decimal(0));
    }

    // Apply store credit (up to full order total)
    let storeCreditApplied = new Prisma.Decimal(0);
    if (dto.storeCreditAmount && dto.storeCreditAmount > 0) {
      const creditBalance = await this.storeCredit.getBalance(userId);
      const requested = new Prisma.Decimal(dto.storeCreditAmount);
      storeCreditApplied = Prisma.Decimal.min(requested, new Prisma.Decimal(creditBalance), total);
      total = Prisma.Decimal.max(total.sub(storeCreditApplied), new Prisma.Decimal(0));
    }

    // Apply gift card (up to remaining total)
    let giftCardDiscount = new Prisma.Decimal(0);
    let giftCardId: string | undefined;
    if (dto.giftCardCode) {
      const gcResult = await this.giftCard.applyToOrder(dto.giftCardCode, total.toNumber());
      giftCardDiscount = new Prisma.Decimal(gcResult.discountAmount);
      giftCardId = gcResult.giftCardId;
      total = Prisma.Decimal.max(total.sub(giftCardDiscount), new Prisma.Decimal(0));
    }

    const amountPaise = Math.round(total.toNumber() * 100);

    let shippingAddress: Prisma.JsonValue | undefined;
    if (dto.addressId) {
      const addr = await this.prisma.userAddress.findFirst({
        where: { id: dto.addressId, userId },
      });
      if (addr) {
        shippingAddress = {
          fullName: addr.fullName,
          phone: addr.phone,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          country: addr.country,
        };
      }
    }

    const isCod = dto.paymentMethod === 'COD';

    if (isCod) {
      // COD: generate OTP for delivery verification
      const codOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const codOtpExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // COD: skip Razorpay, confirm order immediately
      const order = await this.prisma.order.create({
        data: {
          userId,
          status: OrderStatus.CONFIRMED,
          subtotal,
          discountAmount,
          total,
          taxableAmount: taxable,
          cgst: gstBreakup.cgst,
          sgst: gstBreakup.sgst,
          igst: gstBreakup.igst,
          affiliateCode: dto.affiliateCode ?? null,
          couponId,
          shippingAddress: shippingAddress ?? Prisma.JsonNull,
          notes: dto.notes,
          codOtp,
          codOtpExpiresAt,
          items: { create: orderItems },
          payment: {
            create: {
              method: PaymentMethod.COD,
              razorpayOrderId: `cod_${Date.now()}`,
              amount: amountPaise,
              currency: 'INR',
              status: PaymentStatus.PENDING, // COD paid on delivery
            },
          },
        },
        include: {
          items: { include: { product: { select: { id: true, name: true, quantity: true } } } },
          user: { select: { id: true, name: true, email: true, fcmToken: true } },
        },
      });

      // Deduct inventory + redeem coupon atomically
      await this.prisma.$transaction(async (tx) => {
        for (const item of order.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { quantity: { decrement: item.quantity } },
            });
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        if (couponId) {
          await this.couponService.redeem(tx, couponId, userId);
        }
      });

      // Send confirmation email + push (fire-and-forget)
      this.notification.notifyOrderConfirmed({
        orderId: order.id,
        userName: order.user.name,
        userEmail: order.user.email ?? '',
        fcmToken: order.user.fcmToken ?? undefined,
        items: order.items.map((item) => ({
          name: item.product.name,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        total: Number(order.total),
        shippingAddress: order.shippingAddress as Record<string, string>,
      });
      if (order.user.email) {
        this.mail
          .sendOrderConfirmation({
            to: order.user.email,
            name: order.user.name,
            orderId: order.id,
            items: order.items.map((i) => ({
              name: i.product.name,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              total: Number(i.total),
            })),
            subtotal: Number(order.subtotal),
            discountAmount: Number(order.discountAmount),
            total: Number(order.total),
            paymentMethod: 'COD' as 'COD' | 'ONLINE',
            shippingAddress: order.shippingAddress as Record<string, string>,
          })
          .catch((err: Error) => console.error('[Mail]', err?.message));
      }

      // Admin alert + low-stock check (fire-and-forget)
      this.notification.sendAdminOrderAlert('new_order', order.id, order.user.name, Number(order.total)).catch(() => undefined);
      this.checkLowStockAfterOrder(order.items.map((i) => ({ productId: i.productId, name: i.product.name }))).catch(() => undefined);

      // Track affiliate click if code provided
      if (dto.affiliateCode) {
        this.prisma.affiliateClick.create({
          data: { code: dto.affiliateCode, orderId: order.id, userId },
        }).catch(() => undefined);
      }

      // Loyalty: earn points + handle referral reward (fire-and-forget)
      this.loyalty.earnOnOrder(userId, order.id, Number(order.total)).catch(() => undefined);
      this.referral.completeReferral(userId, order.id).then((referrerId) => {
        if (referrerId) {
          this.loyalty.giveReferralBonus(referrerId, userId).catch(() => undefined);
        }
      }).catch(() => undefined);

      // Redeem loyalty points if requested
      if (loyaltyPointsToRedeem > 0) {
        this.loyalty.redeemPoints(userId, loyaltyPointsToRedeem, order.id).catch(() => undefined);
      }

      // Apply store credit if requested
      if (storeCreditApplied.gt(0)) {
        this.storeCredit.applyCredit(userId, storeCreditApplied.toNumber(), order.id).catch(() => undefined);
      }

      // Deduct gift card balance if used
      if (giftCardId && giftCardDiscount.gt(0)) {
        this.giftCard.deductBalance(giftCardId, giftCardDiscount.toNumber()).catch(() => undefined);
      }

      // Send OTP via email (fire-and-forget)
      if (order.user.email) {
        this.mail.sendRaw({
          to: order.user.email,
          subject: `Your COD Delivery OTP for Order #${order.id.slice(-8).toUpperCase()} | Disent Club`,
          html: `<p>Hi ${order.user.name},</p><p>Your OTP for COD order <strong>#${order.id.slice(-8).toUpperCase()}</strong> is: <strong style="font-size:24px;letter-spacing:4px">${codOtp}</strong></p><p>Share this OTP with the delivery agent to confirm delivery. Valid for 7 days.</p>`,
          text: `Hi ${order.user.name}, your COD OTP for order #${order.id.slice(-8).toUpperCase()} is: ${codOtp}. Share this with the delivery agent.`,
        }).catch((err: Error) => console.error('[COD OTP Mail]', err?.message));
      }

      return {
        orderId: order.id,
        paymentMethod: 'COD',
        codOtp,
        amount: amountPaise,
        currency: 'INR',
      };
    }

    // Online payment: create Razorpay order
    const rpOrder = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    });

    const order = await this.prisma.order.create({
      data: {
        userId,
        subtotal,
        discountAmount,
        total,
        taxableAmount: taxable,
        cgst: gstBreakup.cgst,
        sgst: gstBreakup.sgst,
        igst: gstBreakup.igst,
        affiliateCode: dto.affiliateCode ?? null,
        couponId,
        shippingAddress: shippingAddress ?? Prisma.JsonNull,
        notes: dto.notes,
        items: {
          create: orderItems,
        },
        payment: {
          create: {
            method: PaymentMethod.ONLINE,
            razorpayOrderId: rpOrder.id,
            amount: amountPaise,
            currency: 'INR',
            status: PaymentStatus.PENDING,
          },
        },
      },
    });

    // Track affiliate click if code provided
    if (dto.affiliateCode) {
      this.prisma.affiliateClick.create({
        data: { code: dto.affiliateCode, orderId: order.id, userId },
      }).catch(() => undefined);
    }

    // Redeem loyalty points (online — applied upfront)
    if (loyaltyPointsToRedeem > 0) {
      this.loyalty.redeemPoints(userId, loyaltyPointsToRedeem, order.id).catch(() => undefined);
    }

    // Apply store credit immediately (even for online orders)
    if (storeCreditApplied.gt(0)) {
      this.storeCredit.applyCredit(userId, storeCreditApplied.toNumber(), order.id).catch(() => undefined);
    }

    // Deduct gift card balance if used
    if (giftCardId && giftCardDiscount.gt(0)) {
      this.giftCard.deductBalance(giftCardId, giftCardDiscount.toNumber()).catch(() => undefined);
    }

    return {
      orderId: order.id,
      paymentMethod: 'ONLINE',
      razorpayOrderId: rpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
    };
  }

  async verifyPayment(dto: VerifyPaymentDto): Promise<{ message: string; orderId: string }> {
    const payment = await this.prisma.payment.findUnique({
      where: { razorpayOrderId: dto.razorpayOrderId },
      include: {
        order: {
          include: {
            items: { include: { product: { select: { id: true, name: true, quantity: true } } } },
            user: { select: { id: true, name: true, email: true, fcmToken: true } },
          },
        },
      },
    });

    if (!payment) throw new NotFoundException('Payment record not found');

    if (payment.status === PaymentStatus.PAID) {
      return { message: 'Payment already confirmed', orderId: payment.orderId };
    }

    const keySecret = this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET');
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== dto.razorpaySignature) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, failureReason: 'Signature mismatch' },
      });
      throw new BadRequestException('Payment verification failed: invalid signature');
    }

    // ── Atomic: mark paid + confirm order + deduct inventory + redeem coupon ──
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          razorpayPaymentId: dto.razorpayPaymentId,
          razorpaySignature: dto.razorpaySignature,
          status: PaymentStatus.PAID,
        },
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      // Deduct inventory for each item
      for (const item of payment.order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        // Always decrement master product stock too
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: { decrement: item.quantity } },
        });
      }

      // Redeem coupon (records CouponRedemption + increments usedCount)
      if (payment.order.couponId) {
        await this.couponService.redeem(tx, payment.order.couponId, payment.order.userId);
      }
    });

    // ── Send order confirmation email + push (fire-and-forget) ────────────────
    const order = payment.order;
    this.notification.notifyOrderConfirmed({
      userEmail: order.user.email,
      userName: order.user.name,
      fcmToken: order.user.fcmToken,
      orderId: payment.orderId,
      items: order.items.map((i) => ({
        name: i.product.name,
        size: i.size,
        color: i.color,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
        total: Number(i.total),
      })),
      subtotal: Number(order.subtotal),
      discountAmount: Number(order.discountAmount),
      total: Number(order.total),
      shippingAddress: order.shippingAddress as Record<string, unknown> | null,
    });
    if (order.user.email) {
      this.mail
        .sendOrderConfirmation({
            to: order.user.email,
            name: order.user.name,
            orderId: payment.orderId,
            items: order.items.map((i) => ({
              name: i.product.name,
              size: i.size,
              color: i.color,
              quantity: i.quantity,
              unitPrice: Number(i.unitPrice),
              total: Number(i.total),
            })),
            subtotal: Number(order.subtotal),
            discountAmount: Number(order.discountAmount),
            total: Number(order.total),
            paymentMethod: 'ONLINE' as 'COD' | 'ONLINE',
            shippingAddress: order.shippingAddress as Record<string, string>,
          })
        .catch((err: Error) => console.error('[Mail]', err?.message));
    }

    // Admin alert + low-stock check
    this.notification.sendAdminOrderAlert('new_order', payment.orderId, order.user.name, Number(order.total)).catch(() => undefined);
    this.checkLowStockAfterOrder(order.items.map((i) => ({ productId: i.productId, name: i.product.name }))).catch(() => undefined);

    // Loyalty: earn points + handle referral reward (fire-and-forget)
    this.loyalty.earnOnOrder(order.userId, payment.orderId, Number(order.total)).catch(() => undefined);
    this.referral.completeReferral(order.userId, payment.orderId).then((referrerId) => {
      if (referrerId) {
        this.loyalty.giveReferralBonus(referrerId, order.userId).catch(() => undefined);
      }
    }).catch(() => undefined);

    return { message: 'Payment verified successfully', orderId: payment.orderId };
  }

  async verifyCodOtp(userId: string, orderId: string, otp: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, codOtp: true, codOtpExpiresAt: true, codOtpVerified: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.codOtpVerified) return { message: 'OTP already verified', verified: true };
    if (!order.codOtp) throw new BadRequestException('No OTP associated with this order');
    if (order.codOtpExpiresAt && order.codOtpExpiresAt < new Date()) {
      throw new BadRequestException('OTP has expired');
    }
    if (order.codOtp !== otp.trim()) {
      throw new BadRequestException('Invalid OTP');
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { codOtpVerified: true },
    });
    return { message: 'OTP verified successfully', verified: true };
  }

  async getUserOrders(userId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          items: {
            include: {
              product: { select: { id: true, name: true, slug: true, images: { take: 1 } } },
            },
          },
          payment: { select: { status: true, razorpayPaymentId: true } },
          returnRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, createdAt: true },
          },
          reviews: { select: { id: true, orderItemId: true, rating: true } },
        },
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      items: items.map((order) => this.withOrderActions(order)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }

  // ── Razorpay Webhook ──────────────────────────────────────────────────────────

  /**
   * Handles verified Razorpay webhook events.
   * Called only after HMAC signature has been validated in the controller.
   */
  async handleRazorpayWebhook(event: string, payload: {
    payment?: { entity: { id: string; order_id: string; status: string; amount: number; error_description?: string } };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  }): Promise<void> {
    if (event === 'payment.captured') {
      const entity = payload.payment?.entity;
      if (!entity) return;

      // Idempotency check
      const eventKey = entity.id;
      const alreadyProcessed = await this.prisma.processedWebhookEvent.findUnique({ where: { id: eventKey } });
      if (alreadyProcessed) { console.log(`[Razorpay Webhook] Duplicate event ${eventKey} — skipping`); return; }
      await this.prisma.processedWebhookEvent.create({ data: { id: eventKey, source: 'razorpay' } });

      const payment = await this.prisma.payment.findUnique({
        where: { razorpayOrderId: entity.order_id },
        include: {
          order: {
            include: {
              items: { include: { product: { select: { id: true, name: true, quantity: true } } } },
              user: { select: { id: true, name: true, email: true, fcmToken: true } },
            },
          },
        },
      });
      if (!payment || payment.status === PaymentStatus.PAID) return;

      // Same atomic operation as verifyPayment — idempotent path
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            razorpayPaymentId: entity.id,
            status: PaymentStatus.PAID,
          },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { status: OrderStatus.CONFIRMED },
        });
        for (const item of payment.order.items) {
          if (item.variantId) {
            await tx.productVariant.update({
              where: { id: item.variantId },
              data: { quantity: { decrement: item.quantity } },
            });
          }
          await tx.product.update({
            where: { id: item.productId },
            data: { quantity: { decrement: item.quantity } },
          });
        }
        if (payment.order.couponId) {
          await this.couponService.redeem(tx, payment.order.couponId, payment.order.userId);
        }
      });

      // Notify user
      const order = payment.order;
      this.notification.notifyOrderConfirmed({
        userEmail: order.user.email,
        userName: order.user.name,
        fcmToken: order.user.fcmToken,
        orderId: payment.orderId,
        items: order.items.map((i) => ({
          name: i.product.name,
          size: i.size,
          color: i.color,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          total: Number(i.total),
        })),
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount),
        total: Number(order.total),
        shippingAddress: order.shippingAddress as Record<string, unknown> | null,
      });
      if (order.user.email) {
        this.mail
          .sendOrderConfirmation({
              to: order.user.email,
              name: order.user.name,
              orderId: payment.orderId,
              items: order.items.map((i) => ({
                name: i.product.name,
                size: i.size,
                color: i.color,
                quantity: i.quantity,
                unitPrice: Number(i.unitPrice),
                total: Number(i.total),
              })),
              subtotal: Number(order.subtotal),
              discountAmount: Number(order.discountAmount),
              total: Number(order.total),
              paymentMethod: 'ONLINE' as 'COD' | 'ONLINE',
              shippingAddress: order.shippingAddress as Record<string, string>,
            })
          .catch((err: Error) => console.error('[Mail]', err?.message));
      }
      this.notification.sendAdminOrderAlert('new_order', payment.orderId, order.user.name, Number(order.total)).catch(() => undefined);
      this.checkLowStockAfterOrder(order.items.map((i) => ({ productId: i.productId, name: i.product.name }))).catch(() => undefined);

      console.log(`[Razorpay Webhook] payment.captured — orderId=${payment.orderId} paymentId=${entity.id}`);
    }

    if (event === 'payment.failed') {
      const entity = payload.payment?.entity;
      if (!entity) return;

      await this.prisma.payment.updateMany({
        where: { razorpayOrderId: entity.order_id, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: entity.error_description ?? 'Payment failed',
        },
      });
      console.log(`[Razorpay Webhook] payment.failed — rzpOrderId=${entity.order_id}`);
    }

    if (event === 'refund.processed') {
      const entity = payload.refund?.entity;
      if (!entity) return;

      // Idempotency check
      const refundKey = entity.id;
      const alreadyProcessedRefund = await this.prisma.processedWebhookEvent.findUnique({ where: { id: refundKey } });
      if (alreadyProcessedRefund) { console.log(`[Razorpay Webhook] Duplicate event ${refundKey} — skipping`); return; }
      await this.prisma.processedWebhookEvent.create({ data: { id: refundKey, source: 'razorpay' } });

      const payment = await this.prisma.payment.findFirst({
        where: { razorpayPaymentId: entity.payment_id },
      });
      if (!payment) return;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          razorpayRefundId: entity.id,
          refundedAt: new Date(),
        },
      });
      console.log(`[Razorpay Webhook] refund.processed — paymentId=${entity.payment_id} refundId=${entity.id}`);
    }
  }

  async getOrderById(orderId: string, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, ...(userId ? { userId } : {}) },
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, images: { take: 1 } } },
          },
        },
        payment: true,
        coupon: { select: { code: true, discountType: true, value: true } },
        returnRequests: { orderBy: { createdAt: 'desc' } },
        reviews: {
          include: {
            product: { select: { id: true, name: true, images: { take: 1 } } },
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    return this.withOrderActions(order);
  }

  async cancelOrder(userId: string, orderId: string, dto: CancelOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        payment: true,
        returnRequests: { where: { status: { not: ReturnStatus.REJECTED } } },
        items: true,  // needed for stock restore
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!USER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be cancelled in "${order.status}" status. Request a return after delivery instead.`,
      );
    }

    if (order.returnRequests.length > 0) {
      throw new BadRequestException('A return is already in progress for this order');
    }

    const now = new Date();
    const cancelReason = dto.reason?.trim() || 'Cancelled by customer';
    const isVariantChange = dto.variantChange === true;

    // ── Step 1: mark CANCELLED + restore stock (atomic) ───────────────────────
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt: now,
          cancelReason,
          cancelVariantChange: isVariantChange,
          requestedSize: dto.requestedSize?.trim() ?? null,
          requestedColor: dto.requestedColor?.trim() ?? null,
        },
      });

      // Only restore stock if order was CONFIRMED/PROCESSING (inventory was decremented)
      const stockDeducted = ([
        OrderStatus.CONFIRMED as string,
        OrderStatus.PROCESSING as string,
        OrderStatus.SHIPPED as string,
      ]).includes(order.status);

      if (stockDeducted) {
        await this.restoreStock(
          order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
          tx,
        );
      }
    });

    // ── Step 2: cancel in Shiprocket (if already pushed) ─────────────────────
    const shiprocketOrderId = (order as unknown as { shiprocketOrderId?: string }).shiprocketOrderId;
    if (shiprocketOrderId) {
      this.shiprocket.cancelOrder(shiprocketOrderId).catch((err: Error) =>
        console.error(`[Shiprocket] Cancel order failed for ${orderId}:`, err?.message),
      );
    }

    // ── Step 3: handle payment refund ─────────────────────────────────────────
    const payment = order.payment;
    let refundMode: 'razorpay' | 'local' | 'none' = 'none';
    let razorpayRefundId: string | undefined;

    if (payment?.status === PaymentStatus.PAID) {
      const refundResult = await this.initiateCancelRefund(payment);
      refundMode = refundResult.mode;
      razorpayRefundId = refundResult.razorpayRefundId;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          razorpayRefundId: razorpayRefundId ?? payment.razorpayRefundId,
          refundedAt: new Date(),
        },
      });
    } else if (payment && payment.status === PaymentStatus.PENDING) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, failureReason: 'Order cancelled before payment' },
      });
      refundMode = 'none';
    }

    // ── Step 4: reverse loyalty points ───────────────────────────────────────
    this.loyalty.reverseOrderPoints(userId, orderId).catch((err: Error) =>
      console.error(`[Loyalty] Failed to reverse points for order ${orderId}:`, err?.message),
    );

    // ── Step 5: push notification ─────────────────────────────────────────────
    const cancelUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });
    this.notification.notifyOrderStatusChanged(cancelUser?.fcmToken, orderId, 'CANCELLED');

    const refundMessage =
      refundMode === 'razorpay'
        ? `Refund of ₹${((payment?.amount ?? 0) / 100).toFixed(2)} initiated via Razorpay (ID: ${razorpayRefundId}). It will reflect in 5–7 business days.`
        : refundMode === 'local'
          ? `Refund of ₹${((payment?.amount ?? 0) / 100).toFixed(2)} will be processed manually.`
          : undefined;

    return {
      message: 'Order cancelled successfully',
      orderId,
      refund: refundMode !== 'none' ? { mode: refundMode, razorpayRefundId, message: refundMessage } : null,
    };
  }

  async updateShippingAddress(userId: string, orderId: string, addressId: string): Promise<{ message: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const updatableStatuses: string[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
    if (!updatableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Delivery address can only be changed for orders that are PENDING or CONFIRMED. This order is ${order.status}.`,
      );
    }

    const addr = await this.prisma.userAddress.findFirst({ where: { id: addressId, userId } });
    if (!addr) throw new NotFoundException('Address not found');

    const shippingAddress = {
      fullName: addr.fullName,
      phone: addr.phone,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
    };

    await this.prisma.order.update({
      where: { id: orderId },
      data: { shippingAddress },
    });

    return { message: 'Delivery address updated successfully' };
  }

  async updateOrderItemSize(
    userId: string,
    orderId: string,
    itemId: string,
    newSize: string,
  ): Promise<{ message: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: { where: { id: itemId }, include: { product: { include: { variants: true } } } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const editableStatuses: string[] = [OrderStatus.PENDING, OrderStatus.CONFIRMED];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(
        `Size can only be changed for PENDING or CONFIRMED orders. This order is ${order.status}.`,
      );
    }

    const item = order.items[0];
    if (!item) throw new NotFoundException('Order item not found');
    if (!item.size) throw new BadRequestException('This item has no size to change');

    const normalised = newSize.trim().toUpperCase();
    if (item.size.toUpperCase() === normalised) {
      throw new BadRequestException('That is already the selected size');
    }

    // Check stock for the new size variant
    const newVariant = item.product.variants.find(
      (v) => v.size?.toUpperCase() === normalised && (!v.color || !item.color || v.color === item.color),
    );

    if (newVariant) {
      if (newVariant.quantity < item.quantity) {
        throw new BadRequestException(`Only ${newVariant.quantity} unit(s) of size ${normalised} are available`);
      }
      // Restore old variant stock and reserve new variant stock
      const oldVariant = item.product.variants.find(
        (v) => v.size?.toUpperCase() === item.size!.toUpperCase() && (!v.color || !item.color || v.color === item.color),
      );
      await this.prisma.$transaction([
        ...(oldVariant
          ? [this.prisma.productVariant.update({ where: { id: oldVariant.id }, data: { quantity: { increment: item.quantity } } })]
          : []),
        this.prisma.productVariant.update({ where: { id: newVariant.id }, data: { quantity: { decrement: item.quantity } } }),
        this.prisma.orderItem.update({ where: { id: itemId }, data: { size: normalised } }),
      ]);
    } else {
      // No variant tracking — just check master product stock and update the item
      if (item.product.quantity < item.quantity) {
        throw new BadRequestException(`Size ${normalised} is not available`);
      }
      await this.prisma.orderItem.update({ where: { id: itemId }, data: { size: normalised } });
    }

    return { message: `Size updated to ${normalised} successfully` };
  }

  /**
   * Initiates a Razorpay refund for a cancelled paid order.
   * Returns `mode: 'local'` when the payment ID is simulated (test/dev),
   * and `mode: 'razorpay'` when the API call succeeds.
   */
  private async initiateCancelRefund(payment: Payment): Promise<{
    mode: 'razorpay' | 'local';
    razorpayRefundId?: string;
  }> {
    const paymentId = payment.razorpayPaymentId?.trim();

    if (!paymentId || this.isSimulatedPaymentId(paymentId)) {
      // Test / dev environment — no real payment was captured, skip API call
      return { mode: 'local' };
    }

    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: payment.amount, // full refund in paise
        speed: 'normal',        // 'normal' (5–7 days) or 'optimum' (instant if eligible)
        notes: {
          reason: 'Order cancelled by customer',
          orderId: payment.orderId,
        },
      });
      return { mode: 'razorpay', razorpayRefundId: refund.id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Razorpay refund failed: ${msg}`);
    }
  }

  async requestReturn(userId: string, orderId: string, dto: CreateReturnDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        returnRequests: { where: { status: { notIn: [ReturnStatus.REJECTED, ReturnStatus.REFUNDED] } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Returns are only available for delivered orders');
    }

    if (!order.deliveredAt) {
      throw new BadRequestException('Delivery date not recorded for this order');
    }

    const windowEnd = new Date(order.deliveredAt);
    windowEnd.setDate(windowEnd.getDate() + RETURN_WINDOW_DAYS);
    if (new Date() > windowEnd) {
      throw new BadRequestException(`Return window closed (${RETURN_WINDOW_DAYS} days after delivery)`);
    }

    if (order.returnRequests.length > 0) {
      throw new BadRequestException('A return request already exists for this order');
    }

    const returnType = dto.type ?? 'RETURN';

    // Validate exchange fields
    if (returnType === 'EXCHANGE') {
      if (!dto.orderItemId) {
        throw new BadRequestException('orderItemId is required for size exchange');
      }
      if (!dto.exchangeSize?.trim()) {
        throw new BadRequestException('exchangeSize is required for size exchange');
      }
      // Confirm the item belongs to this order
      const item = order['items'] as any[];
      // We need items — re-query with items
      const fullOrder = await this.prisma.order.findFirst({
        where: { id: orderId, userId },
        include: { items: { include: { product: { include: { variants: true } } } } },
      });
      const orderItem = fullOrder?.items.find((i) => i.id === dto.orderItemId);
      if (!orderItem) {
        throw new BadRequestException('Order item not found in this order');
      }
      if (!orderItem.size) {
        throw new BadRequestException('Selected item has no size — cannot exchange for a different size');
      }
      // Check requested size is actually available as a variant
      const availableSizes = orderItem.product.variants.map((v) => v.size.toLowerCase());
      if (!availableSizes.includes(dto.exchangeSize.trim().toLowerCase())) {
        throw new BadRequestException(`Size "${dto.exchangeSize}" is not available for this product`);
      }
      if (orderItem.size.toLowerCase() === dto.exchangeSize.trim().toLowerCase()) {
        throw new BadRequestException('Exchange size must be different from the original ordered size');
      }
    }

    const effectiveRefundMethod = returnType === 'EXCHANGE' ? 'BANK' : (dto.refundMethod ?? 'BANK');

    const returnRequest = await this.prisma.returnRequest.create({
      data: {
        orderId,
        userId,
        reason: dto.reason.trim(),
        type: returnType,
        refundMethod: effectiveRefundMethod,
        upiId: effectiveRefundMethod === 'UPI' ? (dto.upiId?.trim() ?? null) : null,
        orderItemId: returnType === 'EXCHANGE' ? dto.orderItemId : null,
        exchangeSize: returnType === 'EXCHANGE' ? dto.exchangeSize!.trim() : null,
        status: ReturnStatus.REQUESTED,
      },
    });

    const isStoreCredit = returnType === 'RETURN' && dto.refundMethod === 'STORE_CREDIT';
    const isUpi = returnType === 'RETURN' && dto.refundMethod === 'UPI';
    const message =
      returnType === 'EXCHANGE'
        ? `Size exchange request submitted — you requested size ${dto.exchangeSize}`
        : isStoreCredit
          ? 'Return request submitted — store credit will be added instantly once approved'
          : isUpi
            ? `Return request submitted — refund of ₹ will be sent to UPI: ${dto.upiId} once approved`
            : 'Return request submitted — refund will be processed to your original payment method';

    return { message, returnId: returnRequest.id };
  }

  /** Returns the list of available variant sizes for an item in the user's order */
  async getOrderItemSizes(
    userId: string,
    orderId: string,
    itemId: string,
  ): Promise<{ currentSize: string; availableSizes: { size: string; quantity: number }[] }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: {
          where: { id: itemId },
          include: { product: { include: { variants: { where: { quantity: { gt: 0 } } } } } },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const item = order.items[0];
    if (!item) throw new NotFoundException('Order item not found');
    if (!item.size) throw new BadRequestException('This item has no size');

    const sizes = item.product.variants
      .filter((v) => v.size.toLowerCase() !== item.size.toLowerCase())
      .map((v) => ({ size: v.size, quantity: v.quantity }))
      // deduplicate by size (different colors may share size)
      .reduce(
        (acc, v) => {
          const existing = acc.find((a) => a.size.toLowerCase() === v.size.toLowerCase());
          if (existing) existing.quantity += v.quantity;
          else acc.push(v);
          return acc;
        },
        [] as { size: string; quantity: number }[],
      );

    return { currentSize: item.size, availableSizes: sizes };
  }

  async submitReviews(userId: string, orderId: string, dto: CreateReviewsDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { items: true, reviews: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('You can review products only after delivery');
    }

    const itemMap = new Map(order.items.map((item) => [item.id, item]));
    const reviewedItemIds = new Set(order.reviews.map((r) => r.orderItemId));

    for (const review of dto.reviews) {
      const item = itemMap.get(review.orderItemId);
      if (!item) {
        throw new BadRequestException(`Order item ${review.orderItemId} not found`);
      }
      if (reviewedItemIds.has(review.orderItemId)) {
        throw new BadRequestException(`Item already reviewed`);
      }
    }

    await this.prisma.productReview.createMany({
      data: dto.reviews.map((review) => {
        const item = itemMap.get(review.orderItemId)!;
        return {
          userId,
          productId: item.productId,
          orderId,
          orderItemId: review.orderItemId,
          rating: review.rating,
          comment: review.comment?.trim() || null,
        };
      }),
    });

    return { message: 'Thank you for your review!', count: dto.reviews.length };
  }

  async listReturnRequests(params: { page?: number; limit?: number; status?: ReturnStatus }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.ReturnRequestWhereInput = {};
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              total: true,
              status: true,
              user: { select: { id: true, name: true, email: true } },
              payment: {
                select: {
                  status: true,
                  method: true,
                  amount: true,
                  razorpayPaymentId: true,
                  razorpayRefundId: true,
                  refundedAt: true,
                },
              },
            },
          },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.returnRequest.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }

  async updateReturnStatus(returnId: string, dto: UpdateReturnStatusDto) {
    const returnRequest = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: {
        order: {
          include: {
            payment: true,
            items: {
              include: { product: { select: { id: true, name: true } } },
            },
            user: { select: { id: true, name: true, phone: true, fcmToken: true, email: true } },
          },
        },
      },
    });
    if (!returnRequest) throw new NotFoundException('Return request not found');

    const isExchange = returnRequest.type === 'EXCHANGE';

    // ── Allowed transitions (differ by type) ──────────────────────────────────
    const allowed: Record<ReturnStatus, ReturnStatus[]> = {
      REQUESTED: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
      APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
      // EXCHANGE: RECEIVED → EXCHANGED (dispatch new size), skip REFUNDED
      // RETURN:   RECEIVED → REFUNDED
      RECEIVED: isExchange ? [ReturnStatus.EXCHANGED] : [ReturnStatus.REFUNDED],
      REJECTED: [],
      REFUNDED: [],
      EXCHANGED: [],
    };

    if (!allowed[returnRequest.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot change ${isExchange ? 'exchange' : 'return'} from ${returnRequest.status} to ${dto.status}`,
      );
    }

    const updates: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.returnRequest.update({
        where: { id: returnId },
        data: {
          status: dto.status,
          adminNote: dto.adminNote?.trim() || returnRequest.adminNote,
        },
      }),
    ];

    let refundInfo: {
      processed: boolean;
      mode: 'razorpay' | 'local' | 'cod' | 'none' | 'store_credit';
      razorpayRefundId?: string;
      amount?: number;
    } | null = null;

    // ── APPROVED: create Shiprocket reverse pickup ─────────────────────────────
    if (dto.status === ReturnStatus.APPROVED) {
      const order = returnRequest.order;
      const addr = (order.shippingAddress ?? {}) as Record<string, string>;
      const customerName = addr['fullName'] ?? order.user.name;
      const customerPhone = addr['phone'] ?? order.user.phone ?? '0000000000';

      // Pick the items being returned/exchanged
      const returnItems = isExchange && returnRequest.orderItemId
        ? order.items.filter((i) => i.id === returnRequest.orderItemId)
        : order.items;

      this.shiprocket
        .createReturnPickup({
          returnOrderId: `RET-${returnRequest.id.slice(0, 12)}`,
          orderDate: new Date().toISOString().split('T')[0],
          customerName,
          customerPhone,
          customerAddress: addr['line1'] ?? '',
          customerCity: addr['city'] ?? '',
          customerState: addr['state'] ?? '',
          customerPincode: addr['pincode'] ?? '',
          customerCountry: addr['country'] ?? 'India',
          items: returnItems.map((item) => ({
            name: item.product.name,
            sku: item.variantId ?? item.product.id,
            units: item.quantity,
            selling_price: String(Number(item.unitPrice)),
          })),
          subTotal: returnItems.reduce((s, i) => s + Number(i.total), 0),
        })
        .then(async ({ shiprocketOrderId, shipmentId }) => {
          // Try assigning AWB immediately
          let awbCode = '';
          let courierName = '';
          try {
            const awb = await this.shiprocket.assignAWB(shipmentId);
            awbCode = awb.awbCode;
            courierName = awb.courierName;
          } catch {
            // AWB assignment can fail if couriers aren't set up — store shipment id only
            awbCode = '';
          }

          await this.prisma.returnRequest.update({
            where: { id: returnId },
            data: {
              returnShiprocketOrderId: shiprocketOrderId,
              returnShipmentId: shipmentId,
              returnAwbCode: awbCode || null,
              returnCourierName: courierName || null,
            },
          });

          const action = isExchange ? 'size exchange' : 'return';
          console.log(
            `[Shiprocket] Reverse pickup created for ${action} ${returnId} — srOrderId=${shiprocketOrderId} AWB=${awbCode || 'pending'}`,
          );
        })
        .catch((err: Error) =>
          console.error(`[Shiprocket] Reverse pickup failed for ${returnId}:`, err?.message),
        );

      // Notify user
      this.notification
        .persistAndPush(
          returnRequest.userId,
          isExchange ? 'Exchange approved 🔄' : 'Return approved ✅',
          isExchange
            ? `Your size exchange request to ${returnRequest.exchangeSize} has been approved. A courier will pick up your item shortly.`
            : 'Your return has been approved. A courier will pick up your item shortly.',
          'order',
          order.user.fcmToken ?? undefined,
          { returnId, orderId: returnRequest.orderId },
        )
        .catch(() => undefined);

      if (!isExchange && order.user.email) {
        this.mail
          .sendReturnApproved({
            to: order.user.email,
            name: order.user.name,
            orderId: returnRequest.orderId,
            awbCode: null,
            courierName: null,
            returnType: 'RETURN',
          })
          .catch((err: Error) => console.error('[Mail]', err?.message));
      }
    }

    // ── RECEIVED: restore stock for returned items ────────────────────────────
    if (dto.status === ReturnStatus.RECEIVED) {
      // Determine which items were returned
      const returnedItems = isExchange && returnRequest.orderItemId
        ? returnRequest.order.items.filter((i) => i.id === returnRequest.orderItemId)
        : returnRequest.order.items;

      // Restore stock atomically within the existing transaction
      for (const item of returnedItems) {
        if (item.variantId) {
          // Use updateMany so it silently skips if the variant was deleted
          updates.push(
            this.prisma.productVariant.updateMany({
              where: { id: item.variantId },
              data: { quantity: { increment: item.quantity } },
            }),
          );
        }
        updates.push(
          this.prisma.product.update({
            where: { id: item.productId },
            data: { quantity: { increment: item.quantity } },
          }),
        );
      }
    }

    // ── REFUNDED (RETURN only): process refund via bank or store credit ──────
    if (dto.status === ReturnStatus.REFUNDED) {
      const payment = returnRequest.order.payment;
      const useStoreCredit = returnRequest.refundMethod === 'STORE_CREDIT';

      if (useStoreCredit) {
        // Store credit path — instant credit, no Razorpay call
        const refundAmt = payment ? Number(payment.amount) : 0;
        if (refundAmt > 0) {
          await this.storeCredit.addFromReturn(
            returnRequest.userId,
            refundAmt,
            returnId,
            returnRequest.orderId,
          );
        }
        refundInfo = { processed: true, mode: 'store_credit', amount: refundAmt * 100 };
      } else if (returnRequest.refundMethod === 'UPI') {
        // UPI (COD) path — admin manually transfers; mark order refunded but don't hit Razorpay
        const refundAmt = payment ? Number(payment.amount) : 0;
        refundInfo = { processed: true, mode: 'none' as const, amount: refundAmt * 100 };
        // Admin will separately call markRefundPaid to set refundPaidAt + transactionRef
      } else {
        // Bank refund path — Razorpay
        if (payment) {
          refundInfo = await this.processReturnRefund(payment);
          updates.push(
            this.prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.REFUNDED,
                razorpayRefundId: refundInfo.razorpayRefundId ?? payment.razorpayRefundId,
                refundedAt: new Date(),
              },
            }),
          );
        } else {
          refundInfo = { processed: false, mode: 'none' };
        }
      }

      updates.push(
        this.prisma.order.update({
          where: { id: returnRequest.orderId },
          data: { status: OrderStatus.REFUNDED },
        }),
      );

      // Notify user
      const notifMsg = useStoreCredit
        ? `Store credit of ₹${refundInfo?.amount ? (refundInfo.amount / 100).toFixed(2) : '0'} has been added to your account.`
        : `Your refund for order #${returnRequest.orderId.slice(-8).toUpperCase()} has been processed.`;

      this.notification
        .persistAndPush(
          returnRequest.userId,
          useStoreCredit ? 'Store credit added 🎉' : 'Refund processed 💰',
          notifMsg,
          'order',
          returnRequest.order.user.fcmToken ?? undefined,
          { returnId, orderId: returnRequest.orderId },
        )
        .catch(() => undefined);

      // Reverse loyalty points earned on this order (customer returned the item)
      this.loyalty.reverseOrderPoints(returnRequest.userId, returnRequest.orderId).catch((err: Error) =>
        console.error(`[Loyalty] Failed to reverse points for return on order ${returnRequest.orderId}:`, err?.message),
      );

      if (returnRequest.order.user.email && refundInfo?.amount) {
        if (useStoreCredit) {
          // TODO: send store-credit email when mail template is ready
        } else {
          this.mail
            .sendRefundProcessed({
              to: returnRequest.order.user.email,
              name: returnRequest.order.user.name,
              orderId: returnRequest.orderId,
              amount: refundInfo.amount / 100,
              paymentMethod: 'ONLINE',
            })
            .catch((err: Error) => console.error('[Mail]', err?.message));
        }
      }
    }

    // ── EXCHANGED: validate stock, deduct new size, dispatch via Shiprocket ─────
    if (dto.status === ReturnStatus.EXCHANGED) {
      const order = returnRequest.order;
      const addr = (order.shippingAddress ?? {}) as Record<string, string>;
      const customerName = addr['fullName'] ?? order.user.name;
      const customerPhone = addr['phone'] ?? order.user.phone ?? '0000000000';

      const exchangeItem = order.items.find((i) => i.id === returnRequest.orderItemId);

      if (exchangeItem && returnRequest.exchangeSize) {
        // ── Check stock of the new size ───────────────────────────────────────
        const newVariant = await this.prisma.productVariant.findFirst({
          where: {
            productId: exchangeItem.productId,
            size: { equals: returnRequest.exchangeSize },
          },
        });
        if (!newVariant) {
          throw new BadRequestException(
            `No variant found for size "${returnRequest.exchangeSize}" — cannot dispatch exchange`,
          );
        }
        if (newVariant.quantity < exchangeItem.quantity) {
          throw new BadRequestException(
            `Insufficient stock for size "${returnRequest.exchangeSize}" (need ${exchangeItem.quantity}, have ${newVariant.quantity})`,
          );
        }

        // ── Deduct new size stock + update order item size ────────────────────
        updates.push(
          this.prisma.productVariant.update({
            where: { id: newVariant.id },
            data: { quantity: { decrement: exchangeItem.quantity } },
          }),
          this.prisma.product.update({
            where: { id: exchangeItem.productId },
            data: { quantity: { decrement: exchangeItem.quantity } },
          }),
          this.prisma.orderItem.update({
            where: { id: exchangeItem.id },
            data: { size: returnRequest.exchangeSize, variantId: newVariant.id },
          }),
        );
      }

      // Dispatch new size via Shiprocket (forward)
      this.shiprocket
        .createOrder({
          orderId: `EXC-${returnRequest.id.slice(0, 12)}`,
          orderDate: new Date().toISOString().split('T')[0],
          billingCustomerName: customerName,
          billingPhone: customerPhone,
          billingAddress: addr['line1'] ?? '',
          billingCity: addr['city'] ?? '',
          billingState: addr['state'] ?? '',
          billingPincode: addr['pincode'] ?? '',
          billingCountry: addr['country'] ?? 'India',
          shippingCustomerName: customerName,
          shippingPhone: customerPhone,
          shippingAddress: addr['line1'] ?? '',
          shippingCity: addr['city'] ?? '',
          shippingState: addr['state'] ?? '',
          shippingPincode: addr['pincode'] ?? '',
          shippingCountry: addr['country'] ?? 'India',
          paymentMethod: 'Prepaid',
          subTotal: exchangeItem ? Number(exchangeItem.total) : 0,
          length: 25,
          breadth: 20,
          height: 5,
          weight: 0.5,
          items: exchangeItem
            ? [
                {
                  name: `${exchangeItem.product.name} (Exchange → ${returnRequest.exchangeSize})`,
                  sku: exchangeItem.variantId ?? exchangeItem.product.id,
                  units: exchangeItem.quantity,
                  selling_price: String(Number(exchangeItem.unitPrice)),
                },
              ]
            : order.items.map((item) => ({
                name: item.product.name,
                sku: item.variantId ?? item.product.id,
                units: item.quantity,
                selling_price: String(Number(item.unitPrice)),
              })),
        })
        .then(async ({ shiprocketOrderId, shiprocketShipmentId }) => {
          let awbCode = '';
          let courierName = '';
          try {
            const awb = await this.shiprocket.assignAWB(shiprocketShipmentId);
            awbCode = awb.awbCode;
            courierName = awb.courierName;
          } catch {
            awbCode = '';
          }

          await this.prisma.returnRequest.update({
            where: { id: returnId },
            data: {
              exchangeShiprocketOrderId: shiprocketOrderId,
              exchangeShipmentId: shiprocketShipmentId,
              exchangeAwbCode: awbCode || null,
              exchangeCourierName: courierName || null,
            },
          });

          console.log(
            `[Shiprocket] Exchange forward order created for ${returnId} — srOrderId=${shiprocketOrderId} AWB=${awbCode || 'pending'}`,
          );
        })
        .catch((err: Error) =>
          console.error(`[Shiprocket] Exchange dispatch failed for ${returnId}:`, err?.message),
        );

      // Update order status back to SHIPPED (new item on the way)
      updates.push(
        this.prisma.order.update({
          where: { id: returnRequest.orderId },
          data: { status: OrderStatus.SHIPPED },
        }),
      );

      // Notify user
      this.notification
        .persistAndPush(
          returnRequest.userId,
          'Exchange dispatched 🚚',
          `Your replacement item (size ${returnRequest.exchangeSize}) has been dispatched! Track it in your orders.`,
          'order',
          order.user.fcmToken ?? undefined,
          { returnId, orderId: returnRequest.orderId },
        )
        .catch(() => undefined);
    }

    await this.prisma.$transaction(updates);

    const messageMap: Partial<Record<ReturnStatus, string>> = {
      [ReturnStatus.APPROVED]: isExchange
        ? 'Exchange approved — reverse pickup created in Shiprocket'
        : 'Return approved — reverse pickup created in Shiprocket',
      [ReturnStatus.REJECTED]: `${isExchange ? 'Exchange' : 'Return'} request rejected`,
      [ReturnStatus.RECEIVED]: 'Item received at warehouse',
      [ReturnStatus.REFUNDED]:
        refundInfo?.mode === 'razorpay'
          ? 'Return refunded via Razorpay'
          : refundInfo?.mode === 'local'
            ? 'Marked refunded (payment not captured in Razorpay)'
            : refundInfo?.mode === 'cod'
              ? 'Marked refunded (COD — no online payout)'
              : 'Refund processed',
      [ReturnStatus.EXCHANGED]: 'Exchange dispatched — new size shipped to customer via Shiprocket',
    };

    return {
      message: messageMap[dto.status] ?? 'Status updated',
      returnId,
      refund: refundInfo,
    };
  }

  private isSimulatedPaymentId(paymentId: string | null | undefined): boolean {
    if (!paymentId?.trim()) return true;
    const id = paymentId.trim();
    if (id.startsWith('pay_test_') || id.includes('_review_') || id.includes('_fake_')) {
      return true;
    }
    return !/^pay_[A-Za-z0-9]{8,}$/.test(id);
  }

  private async processReturnRefund(payment: Payment): Promise<{
    processed: boolean;
    mode: 'razorpay' | 'local' | 'cod' | 'none' | 'store_credit';
    razorpayRefundId?: string;
    amount?: number;
  }> {
    if (payment.method === PaymentMethod.COD) {
      return { processed: true, mode: 'cod' };
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      return {
        processed: true,
        mode: 'razorpay',
        razorpayRefundId: payment.razorpayRefundId ?? undefined,
        amount: payment.amount,
      };
    }

    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Cannot refund: online payment was not completed');
    }

    const paymentId = payment.razorpayPaymentId?.trim();
    if (!paymentId || this.isSimulatedPaymentId(paymentId)) {
      return { processed: true, mode: 'local', amount: payment.amount };
    }

    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: payment.amount,
      });
      return {
        processed: true,
        mode: 'razorpay',
        razorpayRefundId: refund.id,
        amount: payment.amount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Razorpay refund failed';
      throw new BadRequestException(`Online refund failed: ${message}`);
    }
  }

  async getProductReviews(productId: string, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const where = { productId };

    const [items, total, aggregate] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true } },
        },
      }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      averageRating: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(1)) : 0,
      reviewsCount: aggregate._count.rating,
    };
  }

  private withOrderActions<
    T extends {
      status: OrderStatus;
      deliveredAt: Date | null;
      cancelledAt: Date | null;
      returnRequests?: { id: string; status: ReturnStatus; createdAt: Date }[];
      reviews?: { id: string; orderItemId: string }[];
      items: { id: string }[];
    },
  >(order: T) {
    const latestReturn = order.returnRequests?.[0] ?? null;
    const reviewedItemIds = new Set((order.reviews ?? []).map((r) => r.orderItemId));
    const unreviewedItems = order.items.filter((item) => !reviewedItemIds.has(item.id));

    let canReturn = false;
    if (order.status === OrderStatus.DELIVERED && order.deliveredAt && !latestReturn) {
      const windowEnd = new Date(order.deliveredAt);
      windowEnd.setDate(windowEnd.getDate() + RETURN_WINDOW_DAYS);
      canReturn = new Date() <= windowEnd;
    }

    const preShipment = (['PENDING', 'CONFIRMED'] as string[]).includes(order.status as string);
    const hasSizedItems = order.items.some((i) => !!(i as { id: string; size?: string | null }).size);

    return {
      ...order,
      actions: {
        canCancel: USER_CANCELLABLE.includes(order.status) && !latestReturn,
        canEditSize: preShipment && hasSizedItems && !latestReturn,
        canChangeAddress: preShipment && !latestReturn,
        canReturn,
        canReview: order.status === OrderStatus.DELIVERED && unreviewedItems.length > 0,
        returnStatus: latestReturn?.status ?? null,
        returnId: latestReturn?.id ?? null,
        reviewedItemIds: [...reviewedItemIds],
      },
    };
  }

  async listAllOrders(params: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.user = {
        OR: [
          { name: { contains: params.search } },
          { email: { contains: params.search } },
        ],
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
          payment: { select: { status: true, method: true } },
          returnRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, createdAt: true },
          },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
    };
  }

  async updateOrderStatus(orderId: string, status: OrderStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        items: { include: { product: true } },
        user: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!canTransition(order.status, status)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${status}`,
      );
    }

    const data: Prisma.OrderUpdateInput = { status };
    if (status === OrderStatus.DELIVERED) {
      data.deliveredAt = new Date();
    }
    if (status === OrderStatus.CANCELLED) {
      data.cancelledAt = new Date();
    }

    const updates: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.order.update({ where: { id: orderId }, data }),
    ];

    if (status === OrderStatus.REFUNDED && order.payment) {
      updates.push(
        this.prisma.payment.update({
          where: { id: order.payment.id },
          data: { status: PaymentStatus.REFUNDED },
        }),
      );
    }

    const [updated] = await this.prisma.$transaction(updates);

    // Push notification: order status changed
    const statusUser = await this.prisma.user.findUnique({
      where: { id: order.userId },
      select: { fcmToken: true, email: true },
    });
    this.notification.notifyOrderStatusChanged(statusUser?.fcmToken, orderId, status);

    // ── Email notifications ──────────────────────────────────────────────
    if (statusUser?.email) {
      if (status === OrderStatus.SHIPPED) {
        this.mail
          .sendOrderShipped({
            to: statusUser.email,
            name: order.user.name,
            orderId,
            awbCode: order.awbCode ?? '',
            courierName: order.courierName ?? '',
            trackingUrl: order.trackingUrl?.startsWith('sr_shipment:') ? undefined : (order.trackingUrl ?? undefined),
          })
          .catch((err: Error) => console.error('[Mail]', err?.message));
      } else if (status === OrderStatus.DELIVERED) {
        this.mail
          .sendOrderDelivered({ to: statusUser.email, name: order.user.name, orderId })
          .catch((err: Error) => console.error('[Mail]', err?.message));
      }
    }

    // ── Shiprocket integration ───────────────────────────────────────────
    if (status === OrderStatus.PROCESSING) {
      this.pushToShiprocket(order).catch((err) =>
        console.error('[Shiprocket] createOrder failed:', err?.message),
      );
    }

    if (status === OrderStatus.SHIPPED && order.shiprocketOrderId) {
      this.assignShiprocketAWB(orderId, order.shiprocketOrderId).catch((err) =>
        console.error('[Shiprocket] assignAWB failed:', err?.message),
      );
    }

    return updated;
  }

  // ── Shiprocket helpers ────────────────────────────────────────────────────

  private async pushToShiprocket(order: {
    id: string;
    createdAt: Date;
    total: Prisma.Decimal;
    shippingAddress: Prisma.JsonValue;
    payment: { method: string } | null;
    user: { name: string; email: string | null; phone: string | null };
    items: {
      product: { name: string; id: string };
      variantId: string | null;
      size: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
    }[];
  }) {
    const addr = (order.shippingAddress ?? {}) as Record<string, string>;
    const name = addr['fullName'] ?? order.user.name;
    const phone = addr['phone'] ?? order.user.phone ?? '0000000000';

    const { shiprocketOrderId, shiprocketShipmentId } =
      await this.shiprocket.createOrder({
        orderId: order.id,
        orderDate: order.createdAt.toISOString().split('T')[0],

        billingCustomerName: name,
        billingPhone: phone,
        billingAddress: addr['line1'] ?? '',
        billingCity: addr['city'] ?? '',
        billingState: addr['state'] ?? '',
        billingPincode: addr['pincode'] ?? '',
        billingCountry: addr['country'] ?? 'India',

        shippingCustomerName: name,
        shippingPhone: phone,
        shippingAddress: addr['line1'] ?? '',
        shippingCity: addr['city'] ?? '',
        shippingState: addr['state'] ?? '',
        shippingPincode: addr['pincode'] ?? '',
        shippingCountry: addr['country'] ?? 'India',

        paymentMethod:
          order.payment?.method === 'COD' ? 'COD' : 'Prepaid',
        subTotal: Number(order.total),

        // Default parcel dimensions — update as needed for your packaging
        length: 25,
        breadth: 20,
        height: 5,
        weight: 0.5,

        items: order.items.map((item) => ({
          name: item.product.name,
          sku: item.variantId ?? item.product.id,
          units: item.quantity,
          selling_price: String(Number(item.unitPrice)),
        })),
      });

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shiprocketOrderId,
        // store shipment id temporarily in trackingUrl until AWB is assigned
        trackingUrl: `sr_shipment:${shiprocketShipmentId}`,
      },
    });

    console.log(
      `[Shiprocket] Order created — shiprocketOrderId=${shiprocketOrderId} shipmentId=${shiprocketShipmentId}`,
    );
  }

  private async assignShiprocketAWB(
    orderId: string,
    shiprocketOrderId: string,
  ) {
    // Retrieve the stored shipment id
    const dbOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { trackingUrl: true, shippingAddress: true, payment: { select: { method: true } } },
    });

    const shipmentId = dbOrder?.trackingUrl?.startsWith('sr_shipment:')
      ? dbOrder.trackingUrl.replace('sr_shipment:', '')
      : shiprocketOrderId;

    const addr = (dbOrder?.shippingAddress ?? {}) as Record<string, string>;
    const deliveryPincode = addr['pincode'] ?? '';
    const pickupPincode = '382210';
    const isCod = dbOrder?.payment?.method === 'COD';

    const { awbCode, courierName, trackingUrl } =
      await this.shiprocket.assignAWB(shipmentId, pickupPincode, deliveryPincode, isCod);

    await this.prisma.order.update({
      where: { id: orderId },
      data: { awbCode, courierName, trackingUrl },
    });

    console.log(
      `[Shiprocket] AWB assigned — awb=${awbCode} courier=${courierName}`,
    );
  }

  /** Admin manually marks a COD order as remitted */
  async markUpiRefundPaid(
    returnId: string,
    transactionRef?: string,
    note?: string,
  ): Promise<{ message: string }> {
    const ret = await this.prisma.returnRequest.findUnique({
      where: { id: returnId },
      include: {
        order: { include: { user: { select: { id: true, name: true, fcmToken: true } }, payment: true } },
      },
    });
    if (!ret) throw new NotFoundException('Return request not found');
    if (ret.refundMethod !== 'UPI') throw new BadRequestException('This return is not a UPI refund');
    if (ret.refundPaidAt) throw new BadRequestException('Refund already marked as paid');

    await this.prisma.returnRequest.update({
      where: { id: returnId },
      data: {
        refundPaidAt: new Date(),
        refundTransactionRef: transactionRef?.trim() ?? null,
        adminNote: note?.trim() ?? ret.adminNote,
        status: ReturnStatus.REFUNDED,
      },
    });

    // Update order status too
    await this.prisma.order.update({
      where: { id: ret.orderId },
      data: { status: OrderStatus.REFUNDED },
    });

    const amount = ret.order.payment ? Number(ret.order.payment.amount) : 0;

    this.notification
      .persistAndPush(
        ret.userId,
        'UPI Refund Sent 💰',
        `₹${amount.toFixed(2)} has been sent to your UPI (${ret.upiId}). Ref: ${transactionRef ?? 'N/A'}`,
        'order',
        ret.order.user.fcmToken ?? undefined,
        { returnId, orderId: ret.orderId },
      )
      .catch(() => undefined);

    return { message: `UPI refund marked as paid. Ref: ${transactionRef ?? '—'}` };
  }

  async markCodRemitted(orderId: string, remittanceRef?: string): Promise<{ message: string }> {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, method: PaymentMethod.COD },
    });
    if (!payment) throw new NotFoundException('COD payment not found for this order');

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        codRemittedAt: new Date(),
        codRemittanceRef: remittanceRef?.trim() || null,
      },
    });
    return { message: 'COD payment marked as remitted' };
  }

  async getOrderTracking(orderId: string, userId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        status: true,
        awbCode: true,
        courierName: true,
        trackingUrl: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    let shiprocketTracking: Record<string, unknown> | null = null;
    if (order.awbCode) {
      try {
        shiprocketTracking = await this.shiprocket.trackByAwb(order.awbCode);
      } catch {
        // best-effort
      }
    }

    // Don't expose internal sentinel string to the user
    const safeTrackingUrl =
      order.trackingUrl?.startsWith('sr_shipment:') ? null : order.trackingUrl;

    return {
      status: order.status,
      awbCode: order.awbCode,
      courierName: order.courierName,
      trackingUrl: safeTrackingUrl,
      shiprocketTracking,
    };
  }

  // ── Shiprocket Webhook ────────────────────────────────────────────────────────

  /**
   * Handles incoming Shiprocket shipment status webhooks.
   * Maps Shiprocket status codes to our OrderStatus and persists tracking info.
   *
   * Shiprocket delivers a flat payload with at minimum:
   *   awb, current_status, courier_name, shipment_track_activities
   */
  async handleShiprocketWebhook(body: Record<string, unknown>): Promise<void> {
    // Route COD remittance events separately
    const event = String(body['event'] ?? '').toLowerCase();
    if (event.includes('cod_remittance') || event.includes('remittance')) {
      await this.handleShiprocketCodRemittance(body);
      return;
    }

    const awb = String(body['awb'] ?? body['awb_code'] ?? '').trim();
    const srStatus = String(body['current_status'] ?? body['status'] ?? '').toUpperCase();

    if (!awb) {
      console.warn('[Shiprocket Webhook] No AWB in payload — ignoring');
      return;
    }

    // Shiprocket status → our OrderStatus map
    const statusMap: Record<string, OrderStatus> = {
      'SHIPPED': OrderStatus.SHIPPED,
      'IN TRANSIT': OrderStatus.SHIPPED,
      'OUT FOR DELIVERY': OrderStatus.SHIPPED,
      'DELIVERED': OrderStatus.DELIVERED,
      'RTO INITIATED': OrderStatus.SHIPPED,
      'RTO DELIVERED': OrderStatus.CANCELLED,  // item returned to sender
      'CANCELLED': OrderStatus.CANCELLED,
      'NDR': OrderStatus.SHIPPED,              // Non-Delivery Report — still in transit
    };

    const newStatus = statusMap[srStatus];
    if (!newStatus) {
      console.log(`[Shiprocket Webhook] Unhandled status "${srStatus}" for AWB ${awb}`);
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { awbCode: awb },
      select: { id: true, status: true, userId: true },
    });
    if (!order) {
      console.warn(`[Shiprocket Webhook] No order found for AWB ${awb}`);
      return;
    }

    // Only advance status (don't regress)
    const statusRank: Record<string, number> = {
      PENDING: 0, CONFIRMED: 1, PROCESSING: 2, SHIPPED: 3, DELIVERED: 4, CANCELLED: 5, REFUNDED: 6,
    };
    if ((statusRank[newStatus] ?? 0) <= (statusRank[order.status] ?? 0)) {
      console.log(`[Shiprocket Webhook] Status "${srStatus}" ≤ current "${order.status}" — skipping`);
      return;
    }

    const updateData: Prisma.OrderUpdateInput = { status: newStatus };
    if (newStatus === OrderStatus.DELIVERED) updateData.deliveredAt = new Date();
    if (newStatus === OrderStatus.CANCELLED) updateData.cancelledAt = new Date();

    // Store latest courier name if provided
    const courierName = String(body['courier_name'] ?? '').trim();
    if (courierName) updateData.courierName = courierName;

    await this.prisma.order.update({ where: { id: order.id }, data: updateData });

    // Notify user of status change
    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
      select: { fcmToken: true, email: true, name: true },
    });
    this.notification.notifyOrderStatusChanged(user?.fcmToken, order.id, newStatus);

    if (user?.email && newStatus === OrderStatus.DELIVERED) {
      this.mail
        .sendOrderDelivered({ to: user.email, name: user.name, orderId: order.id })
        .catch((err: Error) => console.error('[Mail]', err?.message));
    }

    console.log(`[Shiprocket Webhook] Order ${order.id} → ${newStatus} (AWB ${awb} / "${srStatus}")`);
  }

  /**
   * Handles Shiprocket COD remittance webhook.
   * Called when Shiprocket sends a cod_remittance event.
   */
  async handleShiprocketCodRemittance(body: Record<string, unknown>): Promise<void> {
    const awb = String(body['awb'] ?? '').trim();
    const remittanceRef = String(body['remittance_id'] ?? body['remittance_reference'] ?? '').trim();
    if (!awb) return;

    const order = await this.prisma.order.findFirst({
      where: { awbCode: awb },
      include: { payment: true },
    });
    if (!order?.payment || order.payment.method !== PaymentMethod.COD) return;

    await this.prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: PaymentStatus.PAID,    // COD now collected & remitted
        codRemittedAt: new Date(),
        codRemittanceRef: remittanceRef || null,
      },
    });
    console.log(`[Shiprocket Webhook] COD remitted for order ${order.id} AWB ${awb} ref=${remittanceRef}`);
  }

  // ── Stock restore helper (returns + cancellations) ───────────────────────────

  private async restoreStock(
    items: { productId: string; variantId: string | null; quantity: number }[],
    tx: Prisma.TransactionClient,
  ) {
    for (const item of items) {
      if (item.variantId) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { quantity: { increment: item.quantity } },
        });
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity } },
      });
    }
  }

  // ─── Invoice HTML Generator ───────────────────────────────────────────────

  async generateInvoicePdf(orderId: string, userId: string): Promise<Buffer> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: { include: { product: { select: { name: true } } } },
        payment: true,
        coupon: { select: { code: true } },
        user: { select: { name: true, email: true } },
      },
    });
    if (!order) throw new Error('Order not found');

    // Derive shipping & GST from order totals
    const orderAny = order as unknown as Record<string, Prisma.Decimal | null>;
    const gstAmount = Number(orderAny['igst'] ?? 0) + Number(orderAny['cgst'] ?? 0) + Number(orderAny['sgst'] ?? 0);
    const afterDiscount = Number(order.subtotal) - Number(order.discountAmount);
    const shippingAmount = afterDiscount > 1999 ? 0 : 99;

    // Fetch logo from S3 as buffer so PDFKit can embed it
    let logoBuffer: Buffer | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const https = require('https') as typeof import('https');
      logoBuffer = await new Promise<Buffer>((res, rej) => {
        const chunks: Buffer[] = [];
        https.get(
          'https://desent-club-dev-assets-382720393179-ap-southeast-2-an.s3.ap-southeast-2.amazonaws.com/brand/logo.png',
          (response) => {
            response.on('data', (c: Buffer) => chunks.push(c));
            response.on('end', () => res(Buffer.concat(chunks)));
            response.on('error', rej);
          },
        ).on('error', rej);
      });
    } catch { logoBuffer = null; }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PDFDocument = require('pdfkit') as typeof import('pdfkit');

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ref = order.id.slice(-8).toUpperCase();
      const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      const addr = order.shippingAddress as Record<string, string> | null;
      const M = 40;           // margin
      const PW = 595 - M * 2; // usable width (A4 = 595pt)
      const dark  = '#0f172a';
      const indigo = '#4f46e5';
      const slate  = '#475569';
      const muted  = '#94a3b8';
      const line   = '#e2e8f0';
      const bgGrey = '#f8fafc';
      const isPaid = order.payment?.status === 'PAID';
      const isCod  = order.payment?.method === 'COD';

      // ── 1. HEADER BAND ──────────────────────────────────────────────────────
      doc.rect(0, 0, 595, 100).fill(dark);

      // Logo or brand name
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, M, 18, { height: 64, fit: [160, 64] });
        } catch {
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('DISENT CLUB', M, 34);
        }
      } else {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('DISENT CLUB', M, 34);
      }

      // TAX INVOICE right side
      doc.fillColor('#a5b4fc').font('Helvetica-Bold').fontSize(11)
        .text('TAX INVOICE', M, 20, { align: 'right', width: PW });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
        .text(`#${ref}`, M, 35, { align: 'right', width: PW });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
        .text(dateStr, M, 62, { align: 'right', width: PW });

      // ── 2. STATUS BAR ───────────────────────────────────────────────────────
      const statusBg  = isPaid ? '#dcfce7' : isCod ? '#fef9c3' : '#fee2e2';
      const statusClr = isPaid ? '#15803d' : isCod ? '#854d0e' : '#b91c1c';
      const statusTxt = isPaid ? 'PAID' : isCod ? 'CASH ON DELIVERY' : 'PAYMENT PENDING';
      doc.rect(0, 100, 595, 28).fill(statusBg);
      doc.fillColor(statusClr).font('Helvetica-Bold').fontSize(9)
        .text(statusTxt, M, 110, { width: PW, align: 'center' });

      // ── 3. BILLING / SHIPPING BOXES ─────────────────────────────────────────
      let y = 148;
      const half = PW / 2 - 8;
      const col2 = M + half + 16;
      const boxH = 100;

      // Box backgrounds
      doc.roundedRect(M, y, half, boxH, 6).fill(bgGrey);
      doc.roundedRect(col2, y, half, boxH, 6).fill(bgGrey);

      // Left: Billed To
      doc.fillColor(indigo).font('Helvetica-Bold').fontSize(7.5)
        .text('BILLED TO', M + 12, y + 10, { characterSpacing: 1, lineBreak: false });
      doc.moveTo(M + 12, y + 22).lineTo(M + half - 12, y + 22).strokeColor(line).lineWidth(0.5).stroke();
      doc.fillColor(dark).font('Helvetica-Bold').fontSize(10)
        .text(order.user.name ?? '', M + 12, y + 30, { width: half - 24, lineBreak: false });
      doc.fillColor(slate).font('Helvetica').fontSize(9)
        .text(order.user.email ?? '', M + 12, y + 48, { width: half - 24, lineBreak: false });

      // Right: Ship To
      doc.fillColor(indigo).font('Helvetica-Bold').fontSize(7.5)
        .text('SHIP TO', col2 + 12, y + 10, { characterSpacing: 1, lineBreak: false });
      doc.moveTo(col2 + 12, y + 22).lineTo(col2 + half - 12, y + 22).strokeColor(line).lineWidth(0.5).stroke();
      if (addr) {
        const addrLine1 = addr.line1 ?? '';
        const addrLine2 = addr.line2 && addr.line2.trim() ? addr.line2.trim() : '';
        const cityState = `${addr.city ?? ''}, ${addr.state ?? ''} - ${addr.pincode ?? ''}`;
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(10)
          .text(addr.fullName ?? '', col2 + 12, y + 30, { width: half - 24, lineBreak: false });
        doc.fillColor(slate).font('Helvetica').fontSize(8.5);
        // Flow each non-empty address part on its own line to avoid overlap
        const addrParts = [addrLine1, addrLine2, cityState, addr.phone ?? ''].filter(Boolean);
        let addrY = y + 48;
        for (const part of addrParts) {
          doc.text(part, col2 + 12, addrY, { width: half - 24, lineBreak: false });
          addrY += 14;
        }
      }

      // ── 4. ITEMS TABLE ──────────────────────────────────────────────────────
      y += boxH + 14;
      doc.fillColor(indigo).font('Helvetica-Bold').fontSize(7.5)
        .text('ORDER ITEMS', M, y, { characterSpacing: 1 });
      y += 14;

      // Header row
      doc.rect(M, y, PW, 26).fill(indigo);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      const c1 = M + 10, c2 = M + PW * 0.56, c3 = M + PW * 0.72, c4 = M + PW * 0.86;
      doc.text('ITEM DESCRIPTION', c1, y + 9, { width: PW * 0.54 });
      doc.text('QTY', c2, y + 9, { width: PW * 0.14, align: 'center' });
      doc.text('UNIT PRICE', c3, y + 9, { width: PW * 0.13, align: 'right' });
      doc.text('AMOUNT', c4, y + 9, { width: PW * 0.12, align: 'right' });
      y += 26;

      order.items.forEach((item, i) => {
        const rowH = 30;
        doc.rect(M, y, PW, rowH).fill(i % 2 === 0 ? '#ffffff' : bgGrey);
        // left border accent
        doc.rect(M, y, 3, rowH).fill(indigo);

        const label = `${item.product.name}${item.size ? ' · ' + item.size : ''}${item.color ? ' · ' + item.color : ''}`;
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(9)
          .text(label, c1, y + 10, { width: PW * 0.54 });

        doc.fillColor(slate).font('Helvetica').fontSize(9);
        doc.text(String(item.quantity), c2, y + 10, { width: PW * 0.14, align: 'center' });
        doc.text(`Rs. ${Number(item.unitPrice).toFixed(2)}`, c3, y + 10, { width: PW * 0.13, align: 'right' });
        doc.fillColor(dark).font('Helvetica-Bold').fontSize(9)
          .text(`Rs. ${Number(item.total).toFixed(2)}`, c4, y + 10, { width: PW * 0.12, align: 'right' });
        y += rowH;
      });

      // Bottom border of table
      doc.rect(M, y, PW, 1).fill(line);
      y += 16;

      // ── 5. TOTALS ───────────────────────────────────────────────────────────
      const tw = 230;
      const tx = M + PW - tw;

      const drawRow = (label: string, value: string, bold = false, clr = slate, bigFont = false) => {
        doc.fillColor(clr).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bigFont ? 12 : 9.5)
          .text(label, tx, y, { width: tw * 0.52 });
        doc.fillColor(clr).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bigFont ? 12 : 9.5)
          .text(value, tx + tw * 0.52, y, { width: tw * 0.48 - 10, align: 'right' });
        y += bigFont ? 20 : 16;
      };

      drawRow('Subtotal', `Rs. ${Number(order.subtotal).toFixed(2)}`);

      if (Number(order.discountAmount) > 0) {
        const disc = order.coupon ? `Coupon (${order.coupon.code})` : 'Discount';
        drawRow(disc, `- Rs. ${Number(order.discountAmount).toFixed(2)}`, false, '#16a34a');
      }

      if (shippingAmount > 0) drawRow('Shipping', `Rs. ${shippingAmount.toFixed(2)}`);
      if (gstAmount > 0) drawRow(`GST (18%)`, `Rs. ${gstAmount.toFixed(2)}`);

      // Grand total box
      y += 4;
      doc.rect(tx - 8, y - 4, tw + 8, 36).fill(indigo);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
        .text('TOTAL PAYABLE', tx, y + 8, { width: tw * 0.52 });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
        .text(`Rs. ${Number(order.total).toFixed(2)}`, tx + tw * 0.52, y + 7, { width: tw * 0.48 - 10, align: 'right' });
      y += 48;

      // ── 6. THANK YOU + FOOTER ───────────────────────────────────────────────
      y += 16;
      doc.rect(M, y, PW, 56).fill(bgGrey);
      doc.fillColor(indigo).font('Helvetica-Bold').fontSize(11)
        .text('Thank you for shopping with Disent Club!', M + 12, y + 10, { width: PW - 24, align: 'center' });
      doc.fillColor(muted).font('Helvetica').fontSize(8.5)
        .text(`For support: ${this.supportEmail}  |  ${resolveSiteUrl(this.config.get<string>('NEXT_PUBLIC_SITE_URL')).replace(/^https?:\/\//, '')}`, M + 12, y + 28, { width: PW - 24, align: 'center' });
      doc.fillColor(muted).font('Helvetica').fontSize(8)
        .text('Returns accepted within 3 days of delivery. Keep this invoice for reference.', M + 12, y + 42, { width: PW - 24, align: 'center' });

      // Bottom accent bar
      doc.rect(0, 595 + 247 - 8, 595, 8).fill(indigo);

      doc.end();
    });
  }

  /** @deprecated kept for backward compat — use generateInvoicePdf */
  async generateInvoiceHtml(orderId: string, userId: string): Promise<string> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        items: { include: { product: { select: { name: true } } } },
        payment: true,
        coupon: { select: { code: true } },
        user: { select: { name: true, email: true } },
      },
    });
    if (!order) throw new Error('Order not found');

    const addr = order.shippingAddress as Record<string, string> | null;
    const ref = order.id.slice(-8).toUpperCase();
    const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const rows = order.items
      .map(
        (i) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9">${i.product.name}${i.size ? ' / ' + i.size : ''}${i.color ? ' / ' + i.color : ''}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:center">${i.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:right">₹${Number(i.unitPrice).toFixed(2)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;text-align:right">₹${Number(i.total).toFixed(2)}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice #${ref} — Disent Club</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1e293b;padding:32px}
    .card{background:#fff;border-radius:16px;max-width:720px;margin:0 auto;padding:40px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6366f1;padding-bottom:24px;margin-bottom:24px}
    .brand{font-size:22px;font-weight:800;color:#6366f1}
    .brand span{display:block;font-size:11px;font-weight:500;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;margin-top:2px}
    .invoice-meta{text-align:right;font-size:13px;color:#64748b}
    .invoice-meta strong{display:block;font-size:22px;font-weight:700;color:#1e293b;margin-bottom:4px}
    .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:8px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
    .info-box{background:#f8fafc;border-radius:10px;padding:16px}
    .info-box p{font-size:13px;line-height:1.7;color:#475569}
    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead tr{background:#6366f1;color:#fff}
    thead th{padding:10px 8px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
    th:not(:first-child),td:not(:first-child){text-align:right}
    th:nth-child(2),td:nth-child(2){text-align:center}
    tbody tr:hover{background:#f8fafc}
    .totals{margin-left:auto;width:260px}
    .totals tr td{padding:6px 8px;font-size:14px}
    .totals tr td:last-child{text-align:right;font-weight:600}
    .grand td{font-size:16px;font-weight:800;color:#6366f1;border-top:2px solid #e2e8f0;padding-top:10px}
    .badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase}
    .badge-paid{background:#dcfce7;color:#15803d}
    .badge-pending{background:#fef3c7;color:#92400e}
    .footer{margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center}
    @media print{body{background:#fff;padding:0}.card{box-shadow:none}}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">
        <img src="https://desent-club-dev-assets-382720393179-ap-southeast-2-an.s3.ap-southeast-2.amazonaws.com/brand/logo.png" alt="Disent Club" style="height:48px;width:auto;display:block;margin-bottom:4px" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
        <span style="display:none;font-size:22px;font-weight:900;color:#ffffff">Disent Club<span style="font-size:10px;font-weight:500;display:block;letter-spacing:0.15em;margin-top:2px">PREMIUM FASHION</span></span>
      </div>
      <div class="invoice-meta">
        <strong>TAX INVOICE</strong>
        <div>Invoice #${ref}</div>
        <div>Date: ${dateStr}</div>
        <div style="margin-top:6px">
          <span class="badge ${order.payment?.status === 'PAID' ? 'badge-paid' : 'badge-pending'}">
            ${order.payment?.status === 'PAID' ? 'PAID' : order.payment?.method === 'COD' ? 'COD — Pay on Delivery' : 'PENDING'}
          </span>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div>
        <p class="section-title">Billed To</p>
        <div class="info-box">
          <p><strong>${order.user.name}</strong></p>
          <p>${order.user.email ?? ''}</p>
        </div>
      </div>
      <div>
        <p class="section-title">Shipping Address</p>
        <div class="info-box">
          ${addr ? `
          <p><strong>${addr.fullName ?? ''}</strong></p>
          <p>${addr.line1 ?? ''}${addr.line2 ? ', ' + addr.line2 : ''}</p>
          <p>${addr.city ?? ''}, ${addr.state ?? ''} — ${addr.pincode ?? ''}</p>
          <p>${addr.phone ?? ''}</p>` : '<p>—</p>'}
        </div>
      </div>
    </div>

    <p class="section-title">Order Items</p>
    <table>
      <thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <table class="totals">
      <tr><td>Subtotal</td><td>₹${Number(order.subtotal).toFixed(2)}</td></tr>
      ${Number(order.discountAmount) > 0 ? `<tr><td>Discount${order.coupon ? ' (' + order.coupon.code + ')' : ''}</td><td style="color:#ef4444">− ₹${Number(order.discountAmount).toFixed(2)}</td></tr>` : ''}
      <tr><td>Shipping</td><td>Free</td></tr>
      <tr class="grand"><td>Total</td><td>₹${Number(order.total).toFixed(2)}</td></tr>
    </table>

    <div class="footer">
      Thank you for shopping with Disent Club! For support, contact ${this.supportEmail} (${this.supportPhoneDisplay})<br/>
      This is a computer-generated invoice and does not require a signature.
    </div>
  </div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
  }

  // ─── Inventory Alert Helper ───────────────────────────────────────────────

  private async checkLowStockAfterOrder(
    items: { productId: string; name: string }[],
  ): Promise<void> {
    const LOW_STOCK_THRESHOLD = 5;
    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: { quantity: true },
      });
      if (product && product.quantity <= LOW_STOCK_THRESHOLD) {
        await this.notification.sendAdminLowStockAlert(item.name, product.quantity);
      }
    }
  }

  // ─── GST Helper ───────────────────────────────────────────────────────────

  calculateGst(
    taxable: Prisma.Decimal,
    gstRate = 0.18,
    isInterState = true,
  ): { cgst: Prisma.Decimal; sgst: Prisma.Decimal; igst: Prisma.Decimal; total: Prisma.Decimal } {
    const gstTotal = taxable.mul(gstRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    if (isInterState) {
      return {
        cgst: new Prisma.Decimal(0),
        sgst: new Prisma.Decimal(0),
        igst: gstTotal,
        total: gstTotal,
      };
    }
    const half = gstTotal.div(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    return {
      cgst: half,
      sgst: half,
      igst: new Prisma.Decimal(0),
      total: gstTotal,
    };
  }

  // ─── NPS Survey ────────────────────────────────────────────────────────────

  async submitNpsSurvey(
    userId: string,
    orderId: string,
    score: number,
    comment?: string,
  ): Promise<{ message: string }> {
    if (score < 0 || score > 10) {
      throw new BadRequestException('Score must be between 0 and 10');
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId, status: OrderStatus.DELIVERED },
    });
    if (!order) {
      throw new NotFoundException('Delivered order not found');
    }
    await this.prisma.npsSurveyResponse.upsert({
      where: { orderId },
      update: { score, comment: comment ?? null },
      create: { userId, orderId, score, comment: comment ?? null },
    });
    return { message: 'NPS survey submitted' };
  }

  // ── Invoice HTML builder ────────────────────────────────────────────────────
  private buildInvoiceHtml(order: {
    id: string;
    createdAt: Date;
    subtotal: unknown;
    total: unknown;
    discountAmount: unknown;
    shippingAddress: unknown;
    cgst?: unknown;
    sgst?: unknown;
    igst?: unknown;
    taxableAmount?: unknown;
    payment: { status: string; method: string } | null;
    coupon: { code: string } | null;
    user: { name: string; email: string | null };
    items: Array<{
      product: { name: string };
      size?: string | null;
      color?: string | null;
      quantity: number;
      unitPrice: unknown;
      total: unknown;
    }>;
  }): string {
    const ref = order.id.slice(-8).toUpperCase();
    const dateStr = new Date(order.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    const addr = order.shippingAddress as Record<string, string> | null;
    const isPaid = order.payment?.status === 'PAID';
    const isCod = order.payment?.method === 'COD';

    const subtotal = Number(order.subtotal ?? 0);
    const total = Number(order.total ?? 0);
    const discount = Number(order.discountAmount ?? 0);
    const cgst = Number(order.cgst ?? 0);
    const sgst = Number(order.sgst ?? 0);
    const igst = Number(order.igst ?? 0);
    const taxableAmount = Number(order.taxableAmount ?? 0);

    const rows = order.items.map((i) => `
      <tr>
        <td class="item-name">${i.product.name}${i.size ? `<span class="variant"> / ${i.size}</span>` : ''}${i.color ? `<span class="variant"> / ${i.color}</span>` : ''}</td>
        <td class="center">${i.quantity}</td>
        <td class="right">₹${Number(i.unitPrice).toFixed(2)}</td>
        <td class="right bold">₹${Number(i.total).toFixed(2)}</td>
      </tr>`).join('');

    const gstRows = (cgst > 0 || igst > 0) ? `
      ${taxableAmount > 0 ? `<tr><td>Taxable Amount</td><td class="right">₹${taxableAmount.toFixed(2)}</td></tr>` : ''}
      ${cgst > 0 ? `<tr><td>CGST (9%)</td><td class="right">₹${cgst.toFixed(2)}</td></tr>` : ''}
      ${sgst > 0 ? `<tr><td>SGST (9%)</td><td class="right">₹${sgst.toFixed(2)}</td></tr>` : ''}
      ${igst > 0 ? `<tr><td>IGST (18%)</td><td class="right">₹${igst.toFixed(2)}</td></tr>` : ''}
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Invoice #${ref} — Disent Club</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
      background: #f1f5f9;
      color: #1e293b;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #ffffff;
      display: flex;
      flex-direction: column;
    }

    /* ── Header gradient banner ── */
    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #6366f1 40%, #818cf8 100%);
      padding: 36px 44px 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      position: relative;
      overflow: hidden;
    }
    .header::before {
      content: '';
      position: absolute;
      top: -40px; right: -40px;
      width: 180px; height: 180px;
      border-radius: 50%;
      background: rgba(255,255,255,.08);
    }
    .header::after {
      content: '';
      position: absolute;
      bottom: -60px; left: 30%;
      width: 240px; height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,.05);
    }

    /* Logo wordmark */
    .logo {
      display: flex;
      flex-direction: column;
      gap: 2px;
      z-index: 1;
    }
    .logo-wordmark {
      font-size: 30px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
      line-height: 1;
    }
    .logo-wordmark span {
      color: rgba(255,255,255,.6);
    }
    .logo-tagline {
      font-size: 10px;
      font-weight: 500;
      color: rgba(255,255,255,.7);
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    /* Invoice label block */
    .inv-meta {
      text-align: right;
      z-index: 1;
    }
    .inv-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(255,255,255,.65);
    }
    .inv-number {
      font-size: 26px;
      font-weight: 800;
      color: #ffffff;
      margin: 4px 0 6px;
      line-height: 1;
    }
    .inv-date {
      font-size: 12px;
      color: rgba(255,255,255,.75);
      margin-bottom: 10px;
    }

    /* Status badge */
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .badge-paid    { background: #dcfce7; color: #15803d; }
    .badge-cod     { background: #fef3c7; color: #92400e; }
    .badge-pending { background: #fee2e2; color: #b91c1c; }

    /* ── Body ── */
    .body { padding: 36px 44px; flex: 1; }

    /* Address grid */
    .addr-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 32px;
    }
    .addr-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 20px;
    }
    .addr-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .addr-label::before {
      content: '';
      display: inline-block;
      width: 3px; height: 14px;
      background: #6366f1;
      border-radius: 2px;
    }
    .addr-card p { font-size: 12.5px; line-height: 1.75; color: #334155; }
    .addr-card strong { color: #0f172a; font-weight: 600; }

    /* ── Items table ── */
    .section-label {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .section-label::before {
      content: '';
      display: inline-block;
      width: 3px; height: 14px;
      background: #6366f1;
      border-radius: 2px;
    }

    table { width: 100%; border-collapse: collapse; }

    .items-table thead tr {
      background: linear-gradient(90deg, #4f46e5, #6366f1);
    }
    .items-table thead th {
      padding: 11px 12px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #ffffff;
    }
    .items-table thead th:first-child { text-align: left; border-radius: 8px 0 0 0; }
    .items-table thead th:last-child  { border-radius: 0 8px 0 0; }

    .items-table tbody tr { border-bottom: 1px solid #f1f5f9; }
    .items-table tbody tr:last-child { border-bottom: none; }
    .items-table tbody tr:nth-child(even) { background: #fafbff; }

    .item-name { font-size: 13px; font-weight: 500; color: #1e293b; padding: 12px 12px; }
    .variant { font-size: 11px; color: #94a3b8; font-weight: 400; }
    td { font-size: 13px; color: #334155; }
    td.center { text-align: center; padding: 12px 12px; }
    td.right   { text-align: right;  padding: 12px 12px; }
    td.bold    { font-weight: 600; color: #1e293b; }

    /* ── Totals ── */
    .totals-wrap {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      margin-bottom: 32px;
    }
    .totals-table {
      width: 280px;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    .totals-table tr td {
      padding: 9px 16px;
      font-size: 13px;
      color: #475569;
      border-bottom: 1px solid #f1f5f9;
    }
    .totals-table tr td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
    .totals-table tr:last-child td { border-bottom: none; }
    .totals-table .discount td { color: #ef4444; }
    .totals-table .gst-row td { color: #64748b; font-size: 12px; }
    .totals-table .grand td {
      background: linear-gradient(90deg, #4f46e5, #6366f1);
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 800;
    }

    /* ── Decorative divider ── */
    .divider {
      height: 3px;
      background: linear-gradient(90deg, #4f46e5, #818cf8, transparent);
      border-radius: 2px;
      margin: 0 44px 0;
    }

    /* ── Footer ── */
    .footer {
      padding: 24px 44px 32px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .footer-note {
      font-size: 10.5px;
      color: #94a3b8;
      line-height: 1.7;
      max-width: 340px;
    }
    .footer-note strong { color: #64748b; }
    .footer-brand {
      text-align: right;
      font-size: 18px;
      font-weight: 900;
      color: #6366f1;
      letter-spacing: -0.3px;
    }
    .footer-brand span { color: #c7d2fe; }
    .footer-brand small {
      display: block;
      font-size: 9px;
      font-weight: 500;
      color: #cbd5e1;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-top: 2px;
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="logo">
      <img src="https://desent-club-dev-assets-382720393179-ap-southeast-2-an.s3.ap-southeast-2.amazonaws.com/brand/logo.png" alt="Disent Club" style="height:44px;width:auto;display:block" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
      <div style="display:none">
        <div class="logo-wordmark">Disent<span> Club</span></div>
        <div class="logo-tagline">PREMIUM FASHION</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-label">Tax Invoice</div>
      <div class="inv-number">#${ref}</div>
      <div class="inv-date">${dateStr}</div>
      <span class="badge ${isPaid ? 'badge-paid' : isCod ? 'badge-cod' : 'badge-pending'}">
        ${isPaid ? '✓ Paid' : isCod ? 'Cash on Delivery' : 'Payment Pending'}
      </span>
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    <!-- Addresses -->
    <div class="addr-grid">
      <div class="addr-card">
        <div class="addr-label">Billed To</div>
        <p><strong>${order.user.name}</strong></p>
        ${order.user.email ? `<p>${order.user.email}</p>` : ''}
      </div>
      <div class="addr-card">
        <div class="addr-label">Shipping Address</div>
        ${addr ? `
          <p><strong>${addr.fullName ?? ''}</strong></p>
          <p>${addr.line1 ?? ''}${addr.line2 ? ', ' + addr.line2 : ''}</p>
          <p>${addr.city ?? ''}, ${addr.state ?? ''} — ${addr.pincode ?? ''}</p>
          ${addr.phone ? `<p>${addr.phone}</p>` : ''}
        ` : '<p>—</p>'}
      </div>
    </div>

    <!-- Items -->
    <div class="section-label">Order Items</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="text-align:left">Item Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <div class="totals-wrap">
      <table class="totals-table">
        <tr><td>Subtotal</td><td>₹${subtotal.toFixed(2)}</td></tr>
        ${discount > 0 ? `<tr class="discount"><td>Discount${order.coupon ? ` (${order.coupon.code})` : ''}</td><td>− ₹${discount.toFixed(2)}</td></tr>` : ''}
        <tr><td>Shipping</td><td style="color:#16a34a">Free</td></tr>
        ${gstRows}
        <tr class="grand"><td>Total Payable</td><td>₹${total.toFixed(2)}</td></tr>
      </table>
    </div>

  </div>

  <div class="divider"></div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-note">
      <strong>Thank you for shopping with Disent Club!</strong><br/>
      For support, contact <strong>${this.supportEmail}</strong> · <strong>${this.supportPhoneDisplay}</strong><br/>
      This is a system-generated invoice and does not require a physical signature.
    </div>
    <div class="footer-brand">
      <img src="https://desent-club-dev-assets-382720393179-ap-southeast-2-an.s3.ap-southeast-2.amazonaws.com/brand/logo.png" alt="Disent Club" style="height:32px;width:auto;display:inline-block;vertical-align:middle" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" />
      <span style="display:none">Disent<span> Club</span></span>
      <small>PREMIUM FASHION</small>
    </div>
  </div>

</div>
</body>
</html>`;
  }

  // ── Bulk Order Management ─────────────────────────────────────────────────

  async bulkUpdateOrderStatus(orderIds: string[], status: OrderStatus) {
    if (!orderIds.length) throw new BadRequestException('No order IDs provided');

    const results = await Promise.allSettled(
      orderIds.map((id) => this.updateOrderStatus(id, status)),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;
    return { succeeded, failed, total: orderIds.length };
  }

  async exportOrdersCsv(opts: {
    orderIds?: string[];
    status?: OrderStatus;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.OrderWhereInput = {};
    if (opts.orderIds?.length) where.id = { in: opts.orderIds };
    if (opts.status) where.status = opts.status;
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) (where.createdAt as { gte?: Date; lte?: Date }).gte = new Date(opts.from);
      if (opts.to) (where.createdAt as { gte?: Date; lte?: Date }).lte = new Date(opts.to);
    }

    const orders = await this.prisma.order.findMany({
      where,
      take: 1000,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });

    // Build CSV
    const header = 'Order ID,Date,Customer,Email,Items,Total,Status';
    const rows = orders.map((o) => {
      const itemsSummary = o.items.map((i) => `${i.product.name} x${i.quantity}`).join('; ');
      return [
        o.id,
        o.createdAt.toISOString().split('T')[0],
        o.user.name,
        o.user.email ?? '',
        `"${itemsSummary}"`,
        Number(o.total).toFixed(2),
        o.status,
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    return { csv, count: orders.length };
  }
}
