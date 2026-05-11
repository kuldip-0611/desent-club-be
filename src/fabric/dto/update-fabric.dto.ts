import { PartialType } from '@nestjs/swagger';
import { CreateFabricDto } from './create-fabric.dto';

export class UpdateFabricDto extends PartialType(CreateFabricDto) {}
