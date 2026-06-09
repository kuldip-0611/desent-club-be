import { ReturnStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateReturnStatusDto {
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNote?: string;
}
