import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { BackInStockService } from './back-in-stock.service';

@ApiTags('Back-in-Stock')
@Controller()
export class BackInStockController {
  constructor(private readonly backInStockService: BackInStockService) {}

  @Post('products/:id/notify-me')
  @SkipThrottle()
  @ApiOperation({ summary: 'Subscribe to back-in-stock alerts for a product' })
  subscribe(
    @Param('id') productId: string,
    @Body() body: { email: string; size?: string },
    @Request() req?: { user?: { sub: string } },
  ) {
    return this.backInStockService.subscribe(
      productId,
      body.email,
      body.size,
      req?.user?.sub,
    );
  }

  @Get('admin/products/:id/notify-me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List back-in-stock alerts for a product' })
  getAlerts(@Param('id') productId: string) {
    return this.backInStockService.getAlerts(productId);
  }
}
