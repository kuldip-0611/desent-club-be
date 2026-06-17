import { createHmac } from 'crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReturnStatus } from '@prisma/client';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { CreateReviewsDto } from './dto/create-reviews.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import type { RazorpayWebhookEvent } from './dto/razorpay-webhook.dto';
import { OrderService } from './order.service';
import { ShiprocketService } from '../shiprocket/shiprocket.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly config: ConfigService,
    private readonly shiprocketService: ShiprocketService,
  ) {}

  // ── Public: COD serviceability check ──────────────────────────────────────

  @Get('serviceability')
  @ApiOperation({ summary: 'Check COD/prepaid serviceability for a pincode' })
  checkServiceability(
    @Query('pincode') pincode: string,
    @Query('weight') weight?: string,
  ) {
    if (!pincode) throw new BadRequestException('pincode is required');
    return this.shiprocketService.checkServiceability(
      pincode,
      weight ? Number(weight) : 500,
    );
  }

  // ── Public webhooks (no JWT guard) ─────────────────────────────────────────

  /**
   * POST /webhooks/razorpay
   * Razorpay calls this when payments are captured/failed and refunds processed.
   * Validates x-razorpay-signature HMAC before processing.
   */
  @Post('webhooks/razorpay')
  @HttpCode(200)
  @ApiOperation({ summary: 'Razorpay webhook receiver (public — HMAC verified)' })
  async razorpayWebhook(
    @Request() req: RawBodyRequest<{ headers: Record<string, string> }>,
    @Body() body: RazorpayWebhookEvent,
  ) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      console.warn('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping signature check');
    } else {
      const signature = req.headers['x-razorpay-signature'];
      if (!signature) throw new BadRequestException('Missing webhook signature');

      const rawBody = req.rawBody;
      if (!rawBody) throw new BadRequestException('Raw body unavailable');

      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
      if (expected !== signature) throw new BadRequestException('Invalid webhook signature');
    }

    await this.orderService.handleRazorpayWebhook(body.event, body.payload).catch((err: Error) =>
      console.error('[Razorpay Webhook] handler error:', err?.message),
    );
    return { received: true };
  }

  /**
   * POST /webhooks/shiprocket
   * Shiprocket calls this when shipment status changes (SHIPPED, DELIVERED, NDR, RTO, etc.)
   */
  @Post('webhooks/shiprocket')
  @HttpCode(200)
  @ApiOperation({ summary: 'Shiprocket webhook receiver (public)' })
  async shiprocketWebhook(@Body() body: Record<string, unknown>) {
    await this.orderService.handleShiprocketWebhook(body).catch((err: Error) =>
      console.error('[Shiprocket Webhook] handler error:', err?.message),
    );
    return { received: true };
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create order and initiate Razorpay payment' })
  createOrder(@Request() req: { user: { sub: string } }, @Body() dto: CreateOrderDto) {
    return this.orderService.createOrder(req.user.sub, dto);
  }

  @Post('orders/verify-payment')
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.orderService.verifyPayment(dto);
  }

  @Get('orders/my')
  @ApiOperation({ summary: 'Get current user orders' })
  getMyOrders(
    @Request() req: { user: { sub: string } },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orderService.getUserOrders(
      req.user.sub,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('orders/my/:id')
  @ApiOperation({ summary: 'Get specific order for current user' })
  getMyOrder(@Request() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orderService.getOrderById(id, req.user.sub);
  }

  @Patch('orders/my/:id/address')
  @ApiOperation({ summary: 'Update delivery address for a PENDING or CONFIRMED order' })
  updateShippingAddress(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { addressId: string },
  ) {
    return this.orderService.updateShippingAddress(req.user.sub, id, body.addressId);
  }

  @Post('orders/my/:id/cancel')
  @ApiOperation({ summary: 'Cancel order (before shipment)' })
  cancelOrder(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orderService.cancelOrder(req.user.sub, id, dto);
  }

  @Post('orders/my/:id/return')
  @ApiOperation({ summary: 'Request return for delivered order' })
  requestReturn(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: CreateReturnDto,
  ) {
    return this.orderService.requestReturn(req.user.sub, id, dto);
  }

  @Get('orders/my/:id/items/:itemId/sizes')
  @ApiOperation({ summary: 'Get available sizes for a specific order item (for exchange flow)' })
  getOrderItemSizes(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.orderService.getOrderItemSizes(req.user.sub, id, itemId);
  }

  @Get('orders/my/:id/track')
  @ApiOperation({ summary: 'Get shipment tracking for order' })
  trackOrder(@Request() req: { user: { sub: string } }, @Param('id') id: string) {
    return this.orderService.getOrderTracking(id, req.user.sub);
  }

  @Get('orders/my/:id/invoice')
  @ApiOperation({ summary: 'Download PDF invoice for an order' })
  async downloadInvoice(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.orderService.generateInvoicePdf(id, req.user.sub);
    const filename = `invoice-${id.slice(-8).toUpperCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);
  }

  @Post('orders/my/:id/reviews')
  @ApiOperation({ summary: 'Submit product reviews after delivery' })
  submitReviews(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() dto: CreateReviewsDto,
  ) {
    return this.orderService.submitReviews(req.user.sub, id, dto);
  }

  @Post('orders/my/:id/verify-cod')
  @ApiOperation({ summary: 'Verify COD OTP' })
  verifyCodOtp(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body('otp') otp: string,
  ) {
    return this.orderService.verifyCodOtp(req.user.sub, id, otp);
  }

  @Post('orders/my/:id/nps')
  @ApiOperation({ summary: 'Submit NPS survey for a delivered order' })
  submitNps(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Body() body: { score: number; comment?: string },
  ) {
    return this.orderService.submitNpsSurvey(req.user.sub, id, body.score, body.comment);
  }

  @Get('admin/orders')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] List all orders' })
  listOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
    @Query('search') search?: string,
  ) {
    return this.orderService.listAllOrders({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
      search,
    });
  }

  @Get('admin/orders/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Get order by ID' })
  getOrderAdmin(@Param('id') id: string) {
    return this.orderService.getOrderById(id);
  }

  @Patch('admin/orders/:id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Update order status' })
  updateStatus(@Param('id') id: string, @Body('status') status: OrderStatus) {
    return this.orderService.updateOrderStatus(id, status);
  }

  @Get('admin/returns')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] List return requests' })
  listReturns(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ReturnStatus,
  ) {
    return this.orderService.listReturnRequests({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status,
    });
  }

  @Patch('admin/returns/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Update return request status' })
  updateReturn(@Param('id') id: string, @Body() dto: UpdateReturnStatusDto) {
    return this.orderService.updateReturnStatus(id, dto);
  }

  @Patch('admin/orders/:id/cod-remittance')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Mark COD order as remitted (cash received from courier)' })
  markCodRemitted(
    @Param('id') id: string,
    @Body('remittanceRef') remittanceRef?: string,
  ) {
    return this.orderService.markCodRemitted(id, remittanceRef);
  }

  // ── Bulk Order Management ─────────────────────────────────────────────────

  @Patch('admin/orders/bulk/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Bulk update order statuses' })
  bulkUpdateStatus(
    @Body() body: { orderIds: string[]; status: OrderStatus },
  ) {
    return this.orderService.bulkUpdateOrderStatus(body.orderIds, body.status);
  }

  @Post('admin/orders/bulk/export')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Export orders as CSV' })
  exportOrders(@Body() body: { orderIds?: string[]; status?: OrderStatus; from?: string; to?: string }) {
    return this.orderService.exportOrdersCsv(body);
  }
}
