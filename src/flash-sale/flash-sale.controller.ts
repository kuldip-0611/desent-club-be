import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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

  @Get('flash-sales/all-with-products')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get all active flash sales with their products (public)' })
  getAllWithProducts() {
    return this.flashSaleService.getAllActiveSalesWithProducts();
  }

  @Get('flash-sales/:id/products')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get products for a specific flash sale by ID (public)' })
  getSaleProductsById(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.flashSaleService.getFlashSaleProductsById(
      id,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(50, parseInt(limit, 10)) : 24,
    );
  }

  @Get('flash-sales/products')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get products in the current active flash sale (public)' })
  getSaleProducts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.flashSaleService.getFlashSaleProducts(
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(50, parseInt(limit, 10)) : 24,
    );
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
