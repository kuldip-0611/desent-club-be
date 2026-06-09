import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class ApplicableCouponsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  categoryIds?: string[];
}
