import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CouponService } from './coupon.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

@ApiTags('Coupons')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @ApiOperation({
    summary: 'Validate coupon for a subtotal (preview; does not consume usage)',
  })
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponService.validateForSubtotal(
      dto.code,
      dto.subtotal,
      dto.categoryIds,
    );
  }
}
