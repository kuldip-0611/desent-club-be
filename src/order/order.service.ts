import { createHmac } from 'crypto';
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
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateReviewsDto } from './dto/create-reviews.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
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
  ) {
    this.razorpay = new Razorpay({
      key_id: this.config.getOrThrow<string>('RAZORPAY_KEY_ID'),
      key_secret: this.config.getOrThrow<string>('RAZORPAY_KEY_SECRET'),
    });
  }

  async createOrder(
    userId: string,
    dto: CreateOrderDto,
  ): Promise<{
    orderId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
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
      const couponCheck = await this.couponService.validateForSubtotal(
        dto.couponCode,
        subtotal.toNumber(),
        undefined,
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
    const gst = taxable.mul(0.18).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    const total = taxable.add(shipping).add(gst);
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

    return {
      orderId: order.id,
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

    return { message: 'Payment verified successfully', orderId: payment.orderId };
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
              product: { select: { id: true, name: true, images: { take: 1 } } },
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
      include: { payment: true, returnRequests: { where: { status: { not: ReturnStatus.REJECTED } } } },
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

    // ── Step 1: mark order CANCELLED ──────────────────────────────────────────
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED, cancelledAt: now, cancelReason },
    });

    // ── Step 2: handle payment refund ─────────────────────────────────────────
    const payment = order.payment;
    let refundMode: 'razorpay' | 'local' | 'none' = 'none';
    let razorpayRefundId: string | undefined;

    if (payment?.status === PaymentStatus.PAID) {
      // Attempt actual Razorpay refund
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
      // Payment was created in Razorpay but never captured — just mark failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, failureReason: 'Order cancelled before payment' },
      });
      refundMode = 'none';
    }

    // ── Step 3: push notification ─────────────────────────────────────────────
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

    const returnRequest = await this.prisma.returnRequest.create({
      data: {
        orderId,
        userId,
        reason: dto.reason.trim(),
        status: ReturnStatus.REQUESTED,
      },
    });

    return { message: 'Return request submitted', returnId: returnRequest.id };
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
      include: { order: { include: { payment: true } } },
    });
    if (!returnRequest) throw new NotFoundException('Return request not found');

    const allowed: Record<ReturnStatus, ReturnStatus[]> = {
      REQUESTED: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
      APPROVED: [ReturnStatus.RECEIVED, ReturnStatus.REJECTED],
      RECEIVED: [ReturnStatus.REFUNDED],
      REJECTED: [],
      REFUNDED: [],
    };

    if (!allowed[returnRequest.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot change return from ${returnRequest.status} to ${dto.status}`,
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
      mode: 'razorpay' | 'local' | 'cod' | 'none';
      razorpayRefundId?: string;
      amount?: number;
    } | null = null;

    if (dto.status === ReturnStatus.REFUNDED) {
      const payment = returnRequest.order.payment;
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

      updates.push(
        this.prisma.order.update({
          where: { id: returnRequest.orderId },
          data: { status: OrderStatus.REFUNDED },
        }),
      );
    }

    await this.prisma.$transaction(updates);
    return {
      message:
        dto.status === ReturnStatus.REFUNDED && refundInfo?.mode === 'razorpay'
          ? 'Return refunded via Razorpay'
          : dto.status === ReturnStatus.REFUNDED && refundInfo?.mode === 'local'
            ? 'Return marked refunded in app only — payment was not captured in Razorpay'
            : dto.status === ReturnStatus.REFUNDED && refundInfo?.mode === 'cod'
              ? 'Return marked refunded (COD — no online payout)'
              : 'Return status updated',
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
    mode: 'razorpay' | 'local' | 'cod' | 'none';
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

    return {
      ...order,
      actions: {
        canCancel: USER_CANCELLABLE.includes(order.status) && !latestReturn,
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
      include: { payment: true },
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
      select: { fcmToken: true },
    });
    this.notification.notifyOrderStatusChanged(statusUser?.fcmToken, orderId, status);

    return updated;
  }
}
