import { Global, Module } from '@nestjs/common';
import { StoreCreditService } from './store-credit.service';
import { StoreCreditController } from './store-credit.controller';

@Global()
@Module({
  providers: [StoreCreditService],
  controllers: [StoreCreditController],
  exports: [StoreCreditService],
})
export class StoreCreditModule {}
