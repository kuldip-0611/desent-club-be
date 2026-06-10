import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { PrismaModule } from './prisma/prisma.module';
import { CouponModule } from './coupon/coupon.module';
import { FabricModule } from './fabric/fabric.module';
import { ProductCategoryModule } from './product-category/product-category.module';
import { ProductModule } from './product/product.module';
import { SettingsModule } from './settings/settings.module';
import { SizingModule } from './sizing/sizing.module';
import { UserGroupModule } from './user-group/user-group.module';
import { UserModule } from './user/user.module';
import { OrderModule } from './order/order.module';
import { FirebaseModule } from './firebase/firebase.module';
import { ShiprocketModule } from './shiprocket/shiprocket.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { AbandonedCartModule } from './abandoned-cart/abandoned-cart.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    FirebaseModule,
    ShiprocketModule,
    PrismaModule,
    UserModule,
    UserGroupModule,
    AuthModule,
    AdminDashboardModule,
    ProductModule,
    ProductCategoryModule,
    FabricModule,
    CouponModule,
    SizingModule,
    SettingsModule,
    OrderModule,
    WishlistModule,
    AbandonedCartModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
