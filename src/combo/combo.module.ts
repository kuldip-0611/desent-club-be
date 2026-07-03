import { Module } from '@nestjs/common';
import { ComboController } from './combo.controller';
import { ComboService } from './combo.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ComboController],
  providers: [ComboService],
  exports: [ComboService],
})
export class ComboModule {}
