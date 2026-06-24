import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GiftCardController } from './gift-card.controller';
import { GiftCardService } from './gift-card.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PrismaModule, MailModule, ConfigModule],
  controllers: [GiftCardController],
  providers: [GiftCardService],
  exports: [GiftCardService],
})
export class GiftCardModule {}
