import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';

export class ProductFabricRowDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fabricId!: string;

  @ApiProperty({ example: 60, description: 'Share in the blend; all rows must sum to 100' })
  @IsInt()
  @Min(1)
  @Max(100)
  percent!: number;
}
