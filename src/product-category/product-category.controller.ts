import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import {
  categoryImageMulterOptions,
  subcategoryImageMulterOptions,
} from './multer.config';
import { ProductCategorySubcategoryService } from './product-category-subcategory.service';
import { ProductCategoryService } from './product-category.service';

@ApiTags('Admin - Product categories')
@Controller('admin/product-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ProductCategoryController {
  constructor(
    private readonly service: ProductCategoryService,
    private readonly subcategoriesService: ProductCategorySubcategoryService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List product categories' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':categoryId/subcategories')
  @ApiOperation({ summary: 'List subcategories for this category (admin)' })
  listSubcategories(@Param('categoryId', new ParseUUIDPipe()) categoryId: string) {
    return this.subcategoriesService.findByCategoryId(categoryId);
  }

  @Post(':categoryId/subcategories')
  @ApiOperation({ summary: 'Create subcategory under this category' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', subcategoryImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slug', 'name', 'image'],
      properties: {
        slug: { type: 'string', example: 'round-neck' },
        name: { type: 'string', example: 'Round neck' },
        sortOrder: { type: 'number', example: 0 },
        isActive: { type: 'boolean', example: true },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  createSubcategory(
    @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
    @Body() dto: CreateProductCategorySubcategoryDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.subcategoriesService.create(categoryId, dto, image);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one category' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create category' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', categoryImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slug', 'name', 'image'],
      properties: {
        slug: { type: 'string', example: 't-shirt' },
        name: { type: 'string', example: 'T-shirt' },
        isActive: { type: 'boolean', example: true },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  create(
    @Body() dto: CreateProductCategoryDto,
    @UploadedFile() image: Express.Multer.File,
  ) {
    return this.service.create(dto, image);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update category' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', categoryImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', example: 't-shirt' },
        name: { type: 'string', example: 'T-shirt' },
        isActive: { type: 'boolean', example: true },
        image: { type: 'string', format: 'binary' },
      },
    },
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductCategoryDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    return this.service.update(id, dto, image);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete category (products lose this link)' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
