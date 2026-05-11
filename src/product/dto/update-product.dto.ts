import { ProductAudience } from '@prisma/client';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ProductFabricRowDto } from './product-fabric-row.dto';
import { ProductVariantDto } from './product-variant.dto';

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }): number | undefined =>
    value === undefined
      ? undefined
      : typeof value === 'string'
        ? parseFloat(value)
        : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Total stock when not replacing variants' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): number | undefined =>
    value === undefined
      ? undefined
      : typeof value === 'string'
        ? parseInt(value, 10)
        : Number(value),
  )
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ enum: ProductAudience })
  @IsOptional()
  @IsEnum(ProductAudience)
  audience?: ProductAudience;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(100)
  color?: string | null;

  @ApiPropertyOptional({
    type: [ProductFabricRowDto],
    description:
      'When set, replaces all fabric blend rows. Each percent 1–100; sum must be 100. Use [] to clear.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductFabricRowDto)
  fabrics?: ProductFabricRowDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Set null to clear category' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return String(value).trim();
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({
    type: [String],
    description:
      'When set, replaces measurement links. Empty [] = no chart (custom sizes ok). Non-empty = every variant must use catalog size with these measurements.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  measurementAttributeIds?: string[];

  @ApiPropertyOptional({
    type: [ProductVariantDto],
    description: 'When set, replaces all size rows and updates total quantity to their sum.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }): boolean | undefined => {
    if (value === undefined) return undefined;
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: '1–100 = percent off; send null or 0 to remove discount',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): number | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(100, Math.floor(n));
  })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number | null;
}
