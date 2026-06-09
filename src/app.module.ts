import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    FirebaseModule,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
