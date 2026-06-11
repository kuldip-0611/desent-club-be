import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
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
import { diskStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { BannerService, CreateBannerDto, UpdateBannerDto } from './banner.service';
import { IMAGE_MIME_REGEX, UPLOAD_LIMITS } from '../common/upload-settings';

const BANNERS_UPLOAD_DIR = join(process.cwd(), 'uploads', 'banners');

function ensureBannerUploadDir() {
  if (!existsSync(BANNERS_UPLOAD_DIR)) mkdirSync(BANNERS_UPLOAD_DIR, { recursive: true });
  return BANNERS_UPLOAD_DIR;
}

const bannerMulterOptions = {
  storage: diskStorage({
    destination: (_req: unknown, _file: unknown, cb: (err: null, dest: string) => void) => {
      cb(null, ensureBannerUploadDir());
    },
    filename: (_req: unknown, file: Express.Multer.File, cb: (err: null, name: string) => void) => {
      cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`);
    },
  }),
  limits: { fileSize: UPLOAD_LIMITS.productImageBytes },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (err: Error | null, accept: boolean) => void) => {
    if (!IMAGE_MIME_REGEX.test(file.mimetype)) {
      cb(new BadRequestException('Only JPEG, PNG, GIF, or WebP images are allowed'), false);
      return;
    }
    cb(null, true);
  },
};

@ApiTags('Banners')
@Controller()
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

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
   * Accepts multipart/form-data with an optional `image` file.
   * All other fields sent as form fields (not JSON body).
   */
  @Post('admin/banners')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Admin] Create banner (supports image upload)' })
  @UseInterceptors(FileInterceptor('image', bannerMulterOptions))
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string>,
  ) {
    const imageUrl = file
      ? `/uploads/banners/${file.filename}`
      : body.imageUrl ?? '';

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
   * Accepts multipart/form-data — same as create, image is optional on update.
   */
  @Patch('admin/banners/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '[Admin] Update banner (supports image upload)' })
  @UseInterceptors(FileInterceptor('image', bannerMulterOptions))
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
      // Delete old image file if it was a local upload
      const existing = await this.bannerService.findById(id);
      if (existing?.imageUrl?.startsWith('/uploads/banners/')) {
        const oldPath = join(process.cwd(), existing.imageUrl);
        try { unlinkSync(oldPath); } catch { /* ignore if missing */ }
      }
      dto.imageUrl = `/uploads/banners/${file.filename}`;
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
    // Clean up local image file before deleting record
    const existing = await this.bannerService.findById(id);
    if (existing?.imageUrl?.startsWith('/uploads/banners/')) {
      const filePath = join(process.cwd(), existing.imageUrl);
      try { unlinkSync(filePath); } catch { /* ignore */ }
    }
    return this.bannerService.remove(id);
  }
}
