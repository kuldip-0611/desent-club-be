import { ProductAudience } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Classic hoodie' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Soft cotton blend.' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiProperty({ example: 49.99 })
  @Transform(({ value }: { value: unknown }): number =>
    typeof value === 'string' ? parseFloat(value) : Number(value),
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  /** Total stock when no variants; otherwise recomputed from `variants` JSON. */
  @ApiProperty({ example: 40 })
  @Transform(({ value }: { value: unknown }): number =>
    typeof value === 'string' ? parseInt(value, 10) : Number(value),
  )
  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({
    enum: ProductAudience,
    description: 'Who this product is for',
  })
  @IsOptional()
  @IsEnum(ProductAudience)
  audience?: ProductAudience;

  @ApiPropertyOptional({ example: 'Navy' })
  @Transform(
    ({
      value,
      obj,
    }: {
      value: unknown;
      obj?: Record<string, unknown>;
    }): string => {
      const source = value ?? obj?.colour;
      if (source === undefined || source === null) return '';
      const normalized = String(source).trim();
      if (
        normalized === '' ||
        normalized.toLowerCase() === 'null' ||
        normalized.toLowerCase() === 'undefined'
      ) {
        return '';
      }
      return normalized;
    },
  )
  @IsString()
  @MaxLength(100)
  color!: string;

  @ApiPropertyOptional({
    description:
      'JSON array: [{"fabricId":"uuid","percent":60},{"fabricId":"uuid","percent":40}]. Each percent 1–100; all rows must sum to 100. Omit or [] for no blend.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  fabrics?: string;

  @ApiProperty({ description: 'ProductCategory id from /admin/product-categories' })
  @IsUUID()
  @IsNotEmpty()
  categoryId!: string;

  @ApiPropertyOptional({
    description:
      'Optional ProductCategorySubcategory id; must belong to `categoryId` (same category).',
  })
  @IsOptional()
  @IsUUID()
  subcategoryId?: string;

  @ApiPropertyOptional({
    description:
      'JSON string array of MeasurementAttribute UUIDs (e.g. chest, shoulder, length). When non-empty, every variant must use a catalog size with those measurements filled in Admin → Sizes.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  measurementAttributeIds?: string;

  /** JSON array: [{"size":"M","color":"#000000","quantity":10},{"size":"XL","color":"#000000","quantity":30}] */
  @ApiPropertyOptional({
    description:
      'Optional JSON string of size rows; when set, `quantity` is replaced by the sum of rows.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  variants?: string;

  @ApiPropertyOptional({
    description:
      'Optional JSON string array of color names by image index, e.g. ["Black","Black","Navy"]',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  imageColors?: string;

  @ApiProperty({ example: true })
  @Transform(({ value }: { value: unknown }): boolean => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  isAvailable!: boolean;

  @ApiPropertyOptional({
    example: 15,
    description: 'Percentage off list price (1–100). Omit or 0 for no discount.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.min(100, Math.floor(n));
  })
  @IsInt()
  @Min(1)
  @Max(100)
  discountPercent?: number;

  @Transform(({ value }) => {
    const n = parseFloat(String(value));
    if (!Number.isFinite(n) || n < 0 || n > 1) return undefined;
    return n;
  })
  @IsNumber()
  @Min(0)
  @Max(1)
  gstRate?: number;
}
