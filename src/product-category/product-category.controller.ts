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
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { categoryImageMulterOptions } from './multer.config';
import { ProductCategoryService } from './product-category.service';

@ApiTags('Admin - Product categories')
@Controller('admin/product-categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ProductCategoryController {
  constructor(private readonly service: ProductCategoryService) {}

  @Get()
  @ApiOperation({ summary: 'List product categories' })
  findAll() {
    return this.service.findAll();
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
