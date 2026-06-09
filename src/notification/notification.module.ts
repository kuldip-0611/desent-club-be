import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { NotificationService } from './notification.service';

@Module({
  imports: [ConfigModule, PrismaModule, FirebaseModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
