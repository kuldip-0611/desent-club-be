import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';
import { BackInStockModule } from '../back-in-stock/back-in-stock.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [PrismaModule, forwardRef(() => BackInStockModule), AuditLogModule],
  controllers: [ProductController, ShopController],
  providers: [ProductService, ShopService],
  exports: [ProductService],
})
export class ProductModule {}
