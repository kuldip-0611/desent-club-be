import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { CouponModule } from '../coupon/coupon.module';
import { ShiprocketModule } from '../shiprocket/shiprocket.module';
import { MailModule } from '../mail/mail.module';
import { GiftCardModule } from '../gift-card/gift-card.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, NotificationModule, CouponModule, ShiprocketModule, MailModule, GiftCardModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
