import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ShopController } from './shop.controller';
import { ShopService } from './shop.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductController, ShopController],
  providers: [ProductService, ShopService],
})
export class ProductModule {}
