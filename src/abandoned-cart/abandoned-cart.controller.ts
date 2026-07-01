import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AbandonedCartService } from './abandoned-cart.service';

class CartLineDto {
  @IsString() lineId!: string;
  @IsString() productId!: string;
  @IsString() variantId!: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsOptional() @IsString() image?: string;
  @IsString() size!: string;
  @IsString() color!: string;
  @IsNumber() unitPrice!: number;
  @IsNumber() quantity!: number;
}

class SaveCartDto {
  @IsArray() lines!: CartLineDto[];
  @IsOptional() @IsString() couponCode?: string | null;
  @IsOptional() @IsNumber() couponDiscount?: number;
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class AbandonedCartController {
  constructor(private readonly svc: AbandonedCartService) {}

  @Get()
  load(@Request() req: any) {
    return this.svc.loadCart(req.user.sub);
  }

  @Post('save')
  save(@Request() req: any, @Body() dto: SaveCartDto) {
    return this.svc
      .saveCart(req.user.sub, dto.lines, dto.couponCode ?? null, dto.couponDiscount ?? 0)
      .then(() => ({ ok: true }));
  }
}
