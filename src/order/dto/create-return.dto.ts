import { ReturnRefundMethod, ReturnType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReturnDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  /** RETURN = refund, EXCHANGE = swap for a different size */
  @IsOptional()
  @IsEnum(ReturnType)
  type?: ReturnType;

  /**
   * How the customer wants their refund:
   * BANK = original payment method (5-7 days)
   * STORE_CREDIT = instant credit added to account (can use on next order)
   */
  @ApiPropertyOptional({ enum: ReturnRefundMethod, default: 'BANK' })
  @IsOptional()
  @IsEnum(ReturnRefundMethod)
  refundMethod?: ReturnRefundMethod;

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
