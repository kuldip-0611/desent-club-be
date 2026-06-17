import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListShopProductsQueryDto } from './dto/list-shop-products-query.dto';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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

  @Get('search')
  @ApiOperation({ summary: 'Navbar autocomplete — search products by name / description' })
  searchSuggestions(
    @Query('q') q = '',
    @Query('limit', new DefaultValuePipe(8), ParseIntPipe) limit: number,
  ) {
    return this.shopService.searchSuggestions(q, limit);
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

  @Get('products/:slug/reviews')
  @ApiOperation({ summary: 'Get product reviews' })
  getProductReviews(
    @Param('slug') slug: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.getProductReviews(
      slug,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('products/:slug/size-chart')
  @ApiOperation({ summary: 'Get size guide / measurement chart for a product' })
  getSizeChart(@Param('slug') slug: string) {
    return this.shopService.getSizeChart(slug);
  }

  @Get('filter-options')
  @ApiOperation({ summary: 'Available filter options (colors, sizes, fabrics, price range)' })
  getFilterOptions() {
    return this.shopService.getFilterOptions();
  }

  @Get('sitemap-data')
  @ApiOperation({ summary: 'Sitemap data — product + category slugs' })
  getSitemapData() {
    return this.shopService.getSitemapData();
  }

  @Post('products/:slug/reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Submit product review (requires delivered order)' })
  submitReview(
    @Param('slug') slug: string,
    @Request() req: { user: { sub: string } },
    @Body() body: { rating: number; comment?: string; orderItemId: string },
  ) {
    return this.shopService.submitReview(slug, req.user.sub, body);
  }

  @Get('admin/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List reviews with optional status filter' })
  adminListReviews(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.shopService.adminListReviews(
      status as 'PENDING' | 'APPROVED' | 'REJECTED' | undefined,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Approve or reject a review' })
  adminUpdateReview(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED' },
  ) {
    return this.shopService.adminUpdateReview(id, body.status);
  }
}
