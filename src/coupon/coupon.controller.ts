import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CouponService } from './coupon.service';
import { ApplicableCouponsDto } from './dto/applicable-coupons.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('applicable')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'List coupons applicable to cart subtotal and categories' })
  listApplicable(
    @Body() dto: ApplicableCouponsDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.couponService.listApplicableForCart(
      dto.subtotal,
      dto.categoryIds,
      req.user?.sub,
    );
  }

  @Post('validate')
  @ApiBearerAuth()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Validate coupon for a subtotal (preview; does not consume usage)',
  })
  validate(
    @Body() dto: ValidateCouponDto,
    @Req() req: Request & { user?: JwtPayload },
  ) {
    return this.couponService.validateForSubtotal(
      dto.code,
      dto.subtotal,
      dto.categoryIds,
      req.user?.sub ?? dto.userId,
    );
  }
}
