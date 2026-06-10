import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { AbandonedCartController } from './abandoned-cart.controller';
import { AbandonedCartService } from './abandoned-cart.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [AbandonedCartController],
  providers: [AbandonedCartService],
  exports: [AbandonedCartService],
})
export class AbandonedCartModule {}
