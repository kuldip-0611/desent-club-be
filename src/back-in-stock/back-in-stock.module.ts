import { Module, forwardRef } from '@nestjs/common';
import { BackInStockController } from './back-in-stock.controller';
import { BackInStockService } from './back-in-stock.service';
import { NotificationModule } from '../notification/notification.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [NotificationModule, forwardRef(() => ProductModule)],
  controllers: [BackInStockController],
  providers: [BackInStockService],
  exports: [BackInStockService],
})
export class BackInStockModule {}
