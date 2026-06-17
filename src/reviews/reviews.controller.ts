import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, Request,
} from '@nestjs/common'
import { ReviewsService } from './reviews.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { UserRole, ReviewStatus } from '@prisma/client'

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // ── Admin routes ──────────────────────────────────────────────────────────

  @Get('admin/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  getAdminReviews(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ) {
    return this.reviewsService.getAdminReviews(
      Number(page),
      Number(limit),
      status as ReviewStatus | undefined,
    )
  }

  @Patch('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(@Param('id') id: string, @Body('status') status: ReviewStatus) {
    return this.reviewsService.updateStatus(id, status)
  }

  @Delete('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deleteReview(@Param('id') id: string) {
    return this.reviewsService.deleteReview(id)
  }

  // ── Shop / user routes ────────────────────────────────────────────────────

  @Get('shop/products/:productId/reviews')
  getProductReviews(@Param('productId') productId: string) {
    return this.reviewsService.getProductReviews(productId)
  }

  @Post('shop/products/:productId/reviews')
  @UseGuards(JwtAuthGuard)
  createReview(
    @Param('productId') productId: string,
    @Request() req: any,
    @Body() body: { orderId: string; orderItemId: string; rating: number; comment?: string },
  ) {
    return this.reviewsService.createReview(req.user.userId, { productId, ...body })
  }
}
