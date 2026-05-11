import { PartialType } from '@nestjs/swagger';
import { CreateMeasurementAttributeDto } from './create-measurement-attribute.dto';

export class UpdateMeasurementAttributeDto extends PartialType(
  CreateMeasurementAttributeDto,
) {}
