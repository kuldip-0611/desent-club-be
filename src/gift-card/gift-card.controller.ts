import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GiftCardService } from './gift-card.service';

@ApiTags('Gift Cards')
@Controller()
export class GiftCardController {
  constructor(private readonly giftCardService: GiftCardService) {}

  @Post('gift-cards/purchase')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Purchase a gift card' })
  purchaseGiftCard(
    @Request() req: { user: { sub: string } },
    @Body() body: { amount: number; recipientEmail: string; recipientName?: string; message?: string },
  ) {
    return this.giftCardService.purchaseGiftCard(req.user.sub, body);
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
  @ApiOperation({ summary: '[Admin] List all gift cards' })
  adminListGiftCards(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.giftCardService.adminListGiftCards(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
