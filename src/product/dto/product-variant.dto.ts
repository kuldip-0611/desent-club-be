import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProductVariantDto {
  @ApiProperty({ example: 'M' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  size!: string;

  @ApiPropertyOptional({
    description: 'Catalog size id from /admin/sizes; `size` is normalized to its code',
  })
  @IsOptional()
  @IsUUID('all')
  sizeId?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  color?: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}
