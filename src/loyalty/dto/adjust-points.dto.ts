import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class AdjustPointsDto {
  /**
   * Positive value = add points (BONUS)
   * Negative value = deduct points (must not exceed current balance)
   */
  @ApiProperty({
    description: 'Points to add (positive) or deduct (negative). Cannot be 0.',
    example: 100,
  })
  @IsInt()
  @Min(-100000, { message: 'Cannot deduct more than 100,000 points at once' })
  @Max(100000, { message: 'Cannot add more than 100,000 points at once' })
  points: number;

  @ApiProperty({
    description: 'Reason for the adjustment (shown in user transaction history)',
    example: 'Goodwill compensation for delayed order',
    minLength: 5,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Reason must be at least 5 characters' })
  reason: string;

  @ApiPropertyOptional({
    description: 'Internal admin note (not shown to user)',
    example: 'Customer complained about order #ABC123',
  })
  @IsOptional()
  @IsString()
  adminNote?: string;
}
