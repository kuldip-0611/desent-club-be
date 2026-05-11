import { Module } from '@nestjs/common';
import { CouponAdminController } from './coupon.admin.controller';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  controllers: [CouponAdminController, CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
