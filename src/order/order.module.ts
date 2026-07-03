import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { CouponModule } from '../coupon/coupon.module';
import { ShiprocketModule } from '../shiprocket/shiprocket.module';
import { MailModule } from '../mail/mail.module';
import { GiftCardModule } from '../gift-card/gift-card.module';
import { AbandonedCartModule } from '../abandoned-cart/abandoned-cart.module';
import { ComboModule } from '../combo/combo.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, NotificationModule, CouponModule, ShiprocketModule, MailModule, GiftCardModule, AbandonedCartModule, AuditLogModule, ComboModule],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
