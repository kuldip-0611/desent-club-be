import { ReturnType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReturnDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  /** RETURN = refund, EXCHANGE = swap for a different size */
  @IsOptional()
  @IsEnum(ReturnType)
  type?: ReturnType;

  /** The specific order item to exchange (required when type = EXCHANGE) */
  @IsOptional()
  @IsString()
  orderItemId?: string;

  /** Requested size for the exchange (required when type = EXCHANGE) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  exchangeSize?: string;
}
