import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength } from 'class-validator';

export class SizeMeasurementInputDto {
  @ApiProperty()
  @IsUUID()
  attributeId!: string;

  @ApiPropertyOptional({ description: 'Empty string removes this attribute for the size' })
  @IsString()
  @MaxLength(64)
  value!: string;
}
