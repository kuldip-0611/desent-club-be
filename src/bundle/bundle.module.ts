import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BundleController } from './bundle.controller';
import { BundleService } from './bundle.service';

@Module({
  imports: [PrismaModule],
  controllers: [BundleController],
  providers: [BundleService],
  exports: [BundleService],
})
export class BundleModule {}
