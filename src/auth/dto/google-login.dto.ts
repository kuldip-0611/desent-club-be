import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token from frontend sign-in flow',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ikx...',
  })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiPropertyOptional({
    description: 'Optional display name override',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  name?: string;
}
