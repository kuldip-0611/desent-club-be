import { Module } from '@nestjs/common';
import { MeasurementAttributeController } from './measurement-attribute.controller';
import { MeasurementAttributeService } from './measurement-attribute.service';
import { SizeController } from './size.controller';
import { SizeService } from './size.service';

@Module({
  controllers: [MeasurementAttributeController, SizeController],
  providers: [MeasurementAttributeService, SizeService],
  exports: [MeasurementAttributeService, SizeService],
})
export class SizingModule {}
