import { ApiProperty } from '@nestjs/swagger';

export class AdminProtectedResponseDto {
  @ApiProperty({ example: 'Admin route is accessible' })
  message!: string;
}
