import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductCategorySubcategoriesStandaloneController } from './product-category-subcategories.controller';
import { ProductCategorySubcategoryService } from './product-category-subcategory.service';
import { ProductCategoryController } from './product-category.controller';
import { ProductCategoryService } from './product-category.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductCategoryController, ProductCategorySubcategoriesStandaloneController],
  providers: [ProductCategoryService, ProductCategorySubcategoryService],
})
export class ProductCategoryModule {}
