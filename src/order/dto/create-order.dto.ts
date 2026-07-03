import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty()
  @IsUUID()
  productId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comboId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  couponCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: ['COD', 'ONLINE'], default: 'ONLINE' })
  @IsOptional()
  @IsIn(['COD', 'ONLINE'])
  paymentMethod?: 'COD' | 'ONLINE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affiliateCode?: string;

  /** Amount of store credit to apply to this order */
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  storeCreditAmount?: number;

  /** Loyalty points to redeem on this order */
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  loyaltyPoints?: number;

  /** Gift card code to apply */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  giftCardCode?: string;
}
