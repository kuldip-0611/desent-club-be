import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WishlistService } from './wishlist.service';

class SyncDto {
  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly svc: WishlistService) {}

  @Get()
  getWishlist(@Request() req: any) {
    return this.svc.getWishlist(req.user.sub);
  }

  @Get('ids')
  getIds(@Request() req: any) {
    return this.svc.getProductIds(req.user.sub).then((ids) => ({ ids }));
  }

  @Post('sync')
  sync(@Request() req: any, @Body() dto: SyncDto) {
    return this.svc.syncItems(req.user.sub, dto.productIds).then(() => ({ ok: true }));
  }

  @Post(':productId')
  add(@Request() req: any, @Param('productId') productId: string) {
    return this.svc.addItem(req.user.sub, productId).then(() => ({ ok: true }));
  }

  @Delete(':productId')
  remove(@Request() req: any, @Param('productId') productId: string) {
    return this.svc.removeItem(req.user.sub, productId).then(() => ({ ok: true }));
  }
}
