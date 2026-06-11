import {
  BadRequestException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { BundleService, CreateBundleDto, UpdateBundleDto } from './bundle.service';

@ApiTags('Bundles')
@Controller()
export class BundleController {
  constructor(private readonly bundleService: BundleService) {}

  // ── Public endpoints ───────────────────────────────────────────────────────

  @Get('bundles/active')
  @ApiOperation({ summary: 'List active product bundles (storefront)' })
  listActive() {
    return this.bundleService.listActive();
  }

  @Get('bundles/cart-discount')
  @ApiOperation({ summary: 'Check cart for applicable bundle discount' })
  cartDiscount(@Query('productIds') productIdsParam: string) {
    if (!productIdsParam) throw new BadRequestException('productIds is required');
    const productIds = productIdsParam.split(',').map((id) => id.trim()).filter(Boolean);
    return this.bundleService.checkCartBundle(productIds);
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('admin/bundles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] List all bundles' })
  listAll() {
    return this.bundleService.listAll();
  }

  @Post('admin/bundles')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Create a bundle' })
  create(@Body() dto: CreateBundleDto) {
    return this.bundleService.create(dto);
  }

  @Patch('admin/bundles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Update a bundle' })
  update(@Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundleService.update(id, dto);
  }

  @Delete('admin/bundles/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: '[Admin] Delete a bundle' })
  remove(@Param('id') id: string) {
    return this.bundleService.remove(id);
  }
}
