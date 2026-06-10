import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
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
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { productImageMulterOptions } from './multer.config';
import { ProductService } from './product.service';

@ApiTags('Admin - Products')
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'List all products' })
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAllForAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.productService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create product (form fields + image files)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 20, productImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'price', 'quantity', 'isAvailable'],
      properties: {
        name: { type: 'string', example: 'Hoodie' },
        description: { type: 'string', example: 'Warm cotton' },
        price: { type: 'number', example: 49.99 },
        quantity: {
          type: 'integer',
          example: 40,
          description: 'Total units; superseded when `variants` JSON is sent',
        },
        audience: { type: 'string', enum: ['MEN', 'WOMEN', 'UNISEX'] },
        color: { type: 'string', example: 'Navy' },
        fabrics: {
          type: 'string',
          example:
            '[{"fabricId":"uuid-cotton","percent":60},{"fabricId":"uuid-poly","percent":40}]',
          description:
            'Optional JSON array: fabric UUIDs from /admin/fabrics with percent each; must sum to 100',
        },
        categoryId: {
          type: 'string',
          format: 'uuid',
          description: 'Optional ProductCategory id from /admin/product-categories',
        },
        subcategoryId: {
          type: 'string',
          format: 'uuid',
          description:
            'Optional ProductCategorySubcategory id; must belong to `categoryId` (see nested GET /admin/product-categories/:id/subcategories)',
        },
        measurementAttributeIds: {
          type: 'string',
          example: '["uuid-chest","uuid-shoulder","uuid-length"]',
          description:
            'Optional JSON array of MeasurementAttribute UUIDs. When set, every variant must use catalog `sizeId` and that size must define all selected measurements (Admin → Sizes).',
        },
        variants: {
          type: 'string',
          example:
            '[{"size":"M","color":"#000000","quantity":10,"sizeId":"uuid-of-catalog-size"},{"size":"XL","color":"#000000","quantity":5}]',
          description:
            'JSON array: `size` + `color` + `quantity`; optional `sizeId` (catalog size from /admin/sizes) — size label is normalized to the catalog code',
        },
        imageColors: {
          type: 'string',
          example: '["Black","Black","Navy"]',
          description: 'Optional JSON array of color names mapped by image index',
        },
        isAvailable: { type: 'boolean', example: true },
        discountPercent: {
          type: 'integer',
          example: 15,
          description: 'Optional 1–100 (% off list price); omit for no discount',
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateProductDto,
  ) {
    return this.productService.create(dto, files ?? []);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product fields (JSON)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, dto);
  }

  @Post(':id/images')
  @ApiOperation({ summary: 'Add more images to a product' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 20, productImageMulterOptions))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  appendImages(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('imageColors') imageColors?: string,
  ) {
    return this.productService.appendImages(id, files ?? [], imageColors);
  }

  @Patch(':id/images/:imageId/color')
  @ApiOperation({ summary: 'Update one product image color mapping' })
  updateImageColor(
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
    @Body('color') color?: string,
  ) {
    return this.productService.updateImageColor(productId, imageId, color);
  }

  @Delete(':id/images/:imageId')
  @ApiOperation({ summary: 'Delete one product image' })
  removeImage(
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Param('imageId', new ParseUUIDPipe()) imageId: string,
  ) {
    return this.productService.removeImage(productId, imageId);
  }

  @Patch(':id/images/reorder')
  @ApiOperation({ summary: 'Reorder product images by sortOrder' })
  reorderImages(
    @Param('id', new ParseUUIDPipe()) productId: string,
    @Body('order') order: { id: string; sortOrder: number }[],
  ) {
    return this.productService.reorderImages(productId, order);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product and its images' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.productService.remove(id);
  }
}
