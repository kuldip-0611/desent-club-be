import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ValidateUserCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  categoryIds?: string[];
}
