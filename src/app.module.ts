import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { BackInStockModule } from './back-in-stock/back-in-stock.module';
import { BannerModule } from './banner/banner.module';
import { FlashSaleModule } from './flash-sale/flash-sale.module';
import { MailModule } from './mail/mail.module';
import { BundleModule } from './bundle/bundle.module';
import { StorageModule } from './storage/storage.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { ReferralModule } from './referral/referral.module';
import { CancellationReasonModule } from './cancellation-reason/cancellation-reason.module';
import { StoreCreditModule } from './store-credit/store-credit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule,
    LoyaltyModule,
    ReferralModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60000, limit: 60 },
      { name: 'long', ttl: 3600000, limit: 1000 },
    ]),
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
    BackInStockModule,
    BannerModule,
    FlashSaleModule,
    MailModule,
    BundleModule,
    CancellationReasonModule,
    StoreCreditModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
