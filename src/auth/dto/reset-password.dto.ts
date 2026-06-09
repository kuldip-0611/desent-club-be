import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset email link' })
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'Password@123' })
  @IsString()
  @MinLength(8)
  password!: string;
}
