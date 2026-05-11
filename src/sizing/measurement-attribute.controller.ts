import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateMeasurementAttributeDto } from './dto/create-measurement-attribute.dto';
import { UpdateMeasurementAttributeDto } from './dto/update-measurement-attribute.dto';
import { MeasurementAttributeService } from './measurement-attribute.service';

@ApiTags('Admin - Measurement attributes')
@Controller('admin/measurement-attributes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class MeasurementAttributeController {
  constructor(private readonly service: MeasurementAttributeService) {}

  @Get()
  @ApiOperation({ summary: 'List measurement attributes (chest, length, …)' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one attribute' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create attribute' })
  create(@Body() dto: CreateMeasurementAttributeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update attribute' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeasurementAttributeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete attribute' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}
