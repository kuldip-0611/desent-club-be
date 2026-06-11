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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { BannerService, CreateBannerDto, UpdateBannerDto } from './banner.service';
import { StorageService } from '../storage/storage.service';
import { bannerImageMulterOptions } from '../common/memory-multer.config';

@ApiTags('Banners')
@Controller()
export class BannerController {
  constructor(
    private readonly bannerService: BannerService,
    private readonly storage: StorageService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────────

  @Get('banners')
  @SkipThrottle()
  @ApiOperation({ summary: 'List active banners (public)' })
  listActive(@Query('position') position?: string) {
    return this.bannerService.listActive(position);
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  @Get('admin/banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all banners' })
  listAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.bannerService.listAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * POST /admin/banners
   * Accepts multipart/form-data with an optional `image` file uploaded to S3.
   */
  @Post('admin/banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Admin] Create banner (image uploaded to S3)' })
  @UseInterceptors(FileInterceptor('image', bannerImageMulterOptions))
  async create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    let imageUrl = body.imageUrl ?? '';

    if (file) {
      const result = await this.storage.upload(file, 'banners');
      imageUrl = result.url;
    }

    if (!imageUrl) throw new BadRequestException('An image file or imageUrl is required');

    const dto: CreateBannerDto = {
      title: body.title,
      subtitle: body.subtitle || undefined,
      imageUrl,
      linkUrl: body.linkUrl || undefined,
      position: body.position || 'hero',
      isActive: body.isActive !== 'false',
      sortOrder: body.sortOrder ? parseInt(body.sortOrder, 10) : 0,
      startsAt: body.startsAt || undefined,
      endsAt: body.endsAt || undefined,
    };

    return this.bannerService.create(dto);
  }

  /**
   * PATCH /admin/banners/:id
   * Image is optional on update — only replaces if a new file is uploaded.
   */
  @Patch('admin/banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Admin] Update banner (image uploaded to S3)' })
  @UseInterceptors(FileInterceptor('image', bannerImageMulterOptions))
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    const dto: UpdateBannerDto = {};

    if (body.title !== undefined) dto.title = body.title;
    if (body.subtitle !== undefined) dto.subtitle = body.subtitle;
    if (body.linkUrl !== undefined) dto.linkUrl = body.linkUrl;
    if (body.position !== undefined) dto.position = body.position;
    if (body.isActive !== undefined) dto.isActive = body.isActive !== 'false';
    if (body.sortOrder !== undefined) dto.sortOrder = parseInt(body.sortOrder, 10);
    if (body.startsAt !== undefined) dto.startsAt = body.startsAt || undefined;
    if (body.endsAt !== undefined) dto.endsAt = body.endsAt || undefined;

    if (file) {
      // Delete old S3 object (best-effort)
      const existing = await this.bannerService.findById(id);
      if (existing?.imageUrl) {
        await this.storage.delete(existing.imageUrl).catch(() => undefined);
      }
      const result = await this.storage.upload(file, 'banners');
      dto.imageUrl = result.url;
    } else if (body.imageUrl !== undefined) {
      dto.imageUrl = body.imageUrl;
    }

    return this.bannerService.update(id, dto);
  }

  @Patch('admin/banners/reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Reorder banners' })
  reorder(@Body() body: { items: { id: string; sortOrder: number }[] }) {
    return this.bannerService.reorder(body.items);
  }

  @Delete('admin/banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Delete banner' })
  async remove(@Param('id') id: string) {
    const existing = await this.bannerService.findById(id);
    if (existing?.imageUrl) {
      await this.storage.delete(existing.imageUrl).catch(() => undefined);
    }
    return this.bannerService.remove(id);
  }
}
