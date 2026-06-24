import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { FlashSaleService, CreateFlashSaleDto, UpdateFlashSaleDto } from './flash-sale.service';

@ApiTags('Flash Sales')
@Controller()
export class FlashSaleController {
  constructor(private readonly flashSaleService: FlashSaleService) {}

  @Get('flash-sales/active')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get currently active flash sale (public)' })
  getActive() {
    return this.flashSaleService.getActive();
  }

  @Get('flash-sales/active-all')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get all currently active flash sales (public)' })
  getActiveAll() {
    return this.flashSaleService.getActiveAll();
  }

  @Get('admin/flash-sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all flash sales' })
  listAll() {
    return this.flashSaleService.listAll();
  }

  @Post('admin/flash-sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Create flash sale' })
  create(@Body() dto: CreateFlashSaleDto) {
    return this.flashSaleService.create(dto);
  }

  @Patch('admin/flash-sales/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Update flash sale' })
  update(@Param('id') id: string, @Body() dto: UpdateFlashSaleDto) {
    return this.flashSaleService.update(id, dto);
  }

  @Delete('admin/flash-sales/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Delete flash sale' })
  remove(@Param('id') id: string) {
    return this.flashSaleService.remove(id);
  }
}
