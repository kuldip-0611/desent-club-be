import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GiftCardService } from './gift-card.service';

@ApiTags('Gift Cards')
@Controller()
export class GiftCardController {
  constructor(private readonly giftCardService: GiftCardService) {}

  /** Step 1 — Create Razorpay order. Returns razorpayOrderId + keyId. No gift card is active yet. */
  @Post('gift-cards/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate gift card purchase (creates Razorpay order)' })
  initiateGiftCardPurchase(
    @Request() req: { user: { sub: string } },
    @Body() body: { amount: number; recipientEmail: string; recipientName?: string; message?: string },
  ) {
    return this.giftCardService.initiateGiftCardPurchase(req.user.sub, body);
  }

  /** Step 2 — Verify Razorpay signature. Activates gift card and sends recipient email. */
  @Post('gift-cards/verify-payment')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify payment and activate gift card' })
  verifyGiftCardPayment(
    @Body() body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    return this.giftCardService.verifyGiftCardPayment(body);
  }

  @Post('gift-cards/check')
  @ApiOperation({ summary: 'Check gift card balance (public)' })
  checkGiftCard(@Body('code') code: string) {
    return this.giftCardService.checkGiftCard(code);
  }

  @Get('gift-cards/my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List my purchased gift cards' })
  getMyGiftCards(@Request() req: { user: { sub: string } }) {
    return this.giftCardService.getMyGiftCards(req.user.sub);
  }

  @Get('admin/gift-cards')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all paid gift cards' })
  adminListGiftCards(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.giftCardService.adminListGiftCards(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch('admin/gift-cards/:id/deactivate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Deactivate a gift card' })
  deactivateGiftCard(@Param('id') id: string) {
    return this.giftCardService.deactivateGiftCard(id);
  }
}
