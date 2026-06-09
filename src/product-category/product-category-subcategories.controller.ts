import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateProductCategorySubcategoryDto } from './dto/create-product-category-subcategory.dto';
import { UpdateProductCategorySubcategoryDto } from './dto/update-product-category-subcategory.dto';
import { subcategoryImageMulterOptions } from './multer.config';
import { ProductCategorySubcategoryService } from './product-category-subcategory.service';

@ApiTags('Admin - Product category subcategories')
@Controller('admin/product-category-subcategories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ProductCategorySubcategoriesStandaloneController {
  constructor(private readonly subcategoriesService: ProductCategorySubcategoryService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get one subcategory' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.subcategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update subcategory' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', subcategoryImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', example: 'round-neck' },
        name: { type: 'string', example: 'Round neck' },
        sortOrder: { type: 'number', example: 0 },
        isActive: { type: 'boolean', example: true },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductCategorySubcategoryDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.subcategoriesService.update(id, dto, image);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete subcategory' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.subcategoriesService.remove(id);
  }
}
