import { Module } from '@nestjs/common';
import { CancellationReasonService } from './cancellation-reason.service';
import { CancellationReasonController } from './cancellation-reason.controller';

@Module({
  providers: [CancellationReasonService],
  controllers: [CancellationReasonController],
  exports: [CancellationReasonService],
})
export class CancellationReasonModule {}
