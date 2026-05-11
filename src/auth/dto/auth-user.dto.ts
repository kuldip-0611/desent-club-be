import { ApiProperty } from '@nestjs/swagger';
import { AuthProviderType, UserRole } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'user@example.com', nullable: true })
  email!: string | null;

  @ApiProperty({ example: '+919876543210', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: '/uploads/profiles/example.jpg', nullable: true })
  profileImage!: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role!: UserRole;

  @ApiProperty({ example: true })
  isVerified!: boolean;

  @ApiProperty({ enum: AuthProviderType, example: AuthProviderType.EMAIL })
  provider!: AuthProviderType;
}
