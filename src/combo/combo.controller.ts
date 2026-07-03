import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ComboService, CreateComboDto, UpdateComboDto } from './combo.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('combos')
@Controller('combos')
export class ComboController {
  constructor(private readonly comboService: ComboService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  @Get('active')
  @ApiOperation({ summary: 'List all active combos (public)' })
  listActive() {
    return this.comboService.listActive();
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get active combo by slug (public)' })
  getBySlug(@Param('slug') slug: string) {
    return this.comboService.getBySlug(slug);
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] List all combos' })
  listAll() {
    return this.comboService.listAll();
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Get combo by id' })
  getOne(@Param('id') id: string) {
    return this.comboService.getOne(id);
  }

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Create combo' })
  create(@Body() dto: CreateComboDto) {
    return this.comboService.create(dto);
  }

  @Patch('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Update combo' })
  update(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.comboService.update(id, dto);
  }

  @Delete('admin/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Delete combo' })
  remove(@Param('id') id: string) {
    return this.comboService.remove(id);
  }
}
