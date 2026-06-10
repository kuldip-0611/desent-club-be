import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AbandonedCartService } from './abandoned-cart.service';

class CartItemDto {
  @IsString() productId!: string;
  @IsString() name!: string;
  @IsNumber() quantity!: number;
  @IsNumber() unitPrice!: number;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsString() color?: string;
}

class SaveCartDto {
  @IsArray() items!: CartItemDto[];
}

@Controller('cart')
@UseGuards(JwtAuthGuard)
export class AbandonedCartController {
  constructor(private readonly svc: AbandonedCartService) {}

  @Post('save')
  save(@Request() req: any, @Body() dto: SaveCartDto) {
    return this.svc.saveCart(req.user.sub, dto.items).then(() => ({ ok: true }));
  }
}
