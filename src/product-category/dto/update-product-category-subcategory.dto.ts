import { PartialType } from '@nestjs/swagger';
import { CreateProductCategorySubcategoryDto } from './create-product-category-subcategory.dto';

export class UpdateProductCategorySubcategoryDto extends PartialType(
  CreateProductCategorySubcategoryDto,
) {}
