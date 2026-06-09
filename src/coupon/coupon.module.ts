import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { NotificationModule } from '../notification/notification.module';
import { CouponAdminController } from './coupon.admin.controller';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

@Module({
  imports: [forwardRef(() => AuthModule), NotificationModule],
  controllers: [CouponAdminController, CouponController],
  providers: [CouponService, OptionalJwtAuthGuard],
  exports: [CouponService],
})
export class CouponModule {}
