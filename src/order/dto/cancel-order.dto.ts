import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @ApiPropertyOptional({ description: 'Cancellation reason label' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'True when customer wants to change size/color instead of cancelling outright' })
  @IsOptional()
  @IsBoolean()
  variantChange?: boolean;

  @ApiPropertyOptional({ description: 'Requested new size (e.g. M, L, XL)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  requestedSize?: string;

  @ApiPropertyOptional({ description: 'Requested new color name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestedColor?: string;
}
