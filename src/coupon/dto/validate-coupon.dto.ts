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

export class ValidateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  /** Cart / order subtotal before discount */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  categoryIds?: string[];

  @IsOptional()
  @IsUUID('4')
  userId?: string;
}
