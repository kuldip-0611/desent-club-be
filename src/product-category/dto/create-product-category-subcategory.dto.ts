import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductCategorySubcategoryDto {
  @ApiProperty({ example: 'round-neck' })
  @Transform(({ value }: { value: unknown }): string =>
    String(value ?? '')
      .trim()
      .toLowerCase(),
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  slug!: string;

  @ApiProperty({ example: 'Round neck' })
  @Transform(({ value }: { value: unknown }): string => String(value ?? '').trim())
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    return typeof value === 'string' ? parseInt(value, 10) : Number(value);
  })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): boolean => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  isActive?: boolean;
}
