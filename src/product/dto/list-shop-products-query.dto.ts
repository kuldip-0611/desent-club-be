import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListShopProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsString()
  sort?: string;

  // Advanced filters
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  /** Comma-separated color names e.g. "black,white,navy" */
  @IsOptional()
  @IsString()
  colors?: string;

  /** Comma-separated sizes e.g. "S,M,L" */
  @IsOptional()
  @IsString()
  sizes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;

  /** Comma-separated fabric names */
  @IsOptional()
  @IsString()
  fabrics?: string;

  /** Comma-separated product IDs — when provided, all other filters are ignored */
  @IsOptional()
  @IsString()
  ids?: string;
}
