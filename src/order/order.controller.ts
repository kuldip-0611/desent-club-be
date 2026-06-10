import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
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
import { OrderService } from './order.service';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

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
  @ApiOperation({ summary: 'Download HTML invoice for an order' })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async downloadInvoice(
    @Request() req: { user: { sub: string } },
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const html = await this.orderService.generateInvoiceHtml(id, req.user.sub);
    res.setHeader('Content-Disposition', `inline; filename="invoice-${id.slice(-8).toUpperCase()}.html"`);
    res.send(html);
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
}
