import { Module, forwardRef } from '@nestjs/common';
import { CouponModule } from '../coupon/coupon.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAddressService } from './user-address.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [PrismaModule, forwardRef(() => CouponModule)],
  controllers: [UserController],
  providers: [UserService, UserAddressService],
  exports: [UserService, UserAddressService],
})
export class UserModule {}
