import { Module } from '@nestjs/common';
import { CouponModule } from '../coupon/coupon.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UserGroupController } from './user-group.controller';
import { UserGroupService } from './user-group.service';

@Module({
  imports: [PrismaModule, CouponModule],
  controllers: [UserGroupController],
  providers: [UserGroupService],
  exports: [UserGroupService],
})
export class UserGroupModule {}
