import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateMeasurementAttributeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, numbers, and hyphens (e.g. chest, inseam-length)',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    return String(value).trim().toLowerCase();
  })
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsIn(['cm', 'in'], { message: 'unit must be cm or in' })
  unit?: 'cm' | 'in' | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
