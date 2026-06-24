import { ReturnRefundMethod, ReturnType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
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
   * STORE_CREDIT = instant store credit
   * UPI = manual UPI transfer (for COD orders)
   */
  @ApiPropertyOptional({ enum: ReturnRefundMethod, default: 'BANK' })
  @IsOptional()
  @IsEnum(ReturnRefundMethod)
  refundMethod?: ReturnRefundMethod;

  /**
   * Customer UPI ID — required when refundMethod = UPI.
   * Format: handle@bank  e.g. user@upi, 9876543210@paytm
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[\w.\-+]+@[\w]+$/, { message: 'Invalid UPI ID format. Example: 9876543210@paytm' })
  upiId?: string;

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
