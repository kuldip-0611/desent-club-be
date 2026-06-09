import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserAddressDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone!: string;

  @ApiProperty({ example: '12 MG Road' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional({ example: 'Near City Mall' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty({ example: 'Mumbai' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  city!: string;

  @ApiProperty({ example: 'Maharashtra' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  state!: string;

  @ApiProperty({ example: '400001' })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pincode!: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
