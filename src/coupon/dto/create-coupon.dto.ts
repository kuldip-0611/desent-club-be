import { CouponDiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsBoolean,
  IsUUID,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  code!: string;

  @IsEnum(CouponDiscountType)
  discountType!: CouponDiscountType;

  /** Percent 0–100, or fixed currency amount */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minSubtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString({ each: true })
  @IsUUID('4', { each: true })
  @ArrayUnique()
  categoryIds?: string[];
}
