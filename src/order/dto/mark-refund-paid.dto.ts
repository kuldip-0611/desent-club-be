import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkRefundPaidDto {
  /** Payment reference / UTR number from UPI transfer */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  transactionRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
