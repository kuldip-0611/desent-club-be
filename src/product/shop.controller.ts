import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListShopProductsQueryDto } from './dto/list-shop-products-query.dto';
import { ShopService } from './shop.service';

@ApiTags('Shop')
@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Get('home')
  @ApiOperation({ summary: 'Get storefront home data' })
  getHomeData() {
    return this.shopService.getHomeData();
  }

  @Get('categories')
  @ApiOperation({ summary: 'List active storefront categories' })
  listCategories() {
    return this.shopService.listCategories();
  }

  @Get('products')
  @ApiOperation({ summary: 'List storefront products' })
  listProducts(@Query() query: ListShopProductsQueryDto) {
    return this.shopService.listProducts(query);
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Get storefront product by slug' })
  getProductBySlug(@Param('slug') slug: string) {
    return this.shopService.getProductBySlug(slug);
  }

  @Get('products/:slug/related')
  @ApiOperation({ summary: 'Get related storefront products' })
  listRelatedProducts(@Param('slug') slug: string) {
    return this.shopService.listRelatedProducts(slug);
  }
}
