import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ReviewStatus } from '@prisma/client'

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async getAdminReviews(page: number, limit: number, status?: ReviewStatus) {
    const where = status ? { status } : {}
    const skip = (page - 1) * limit

    const [reviews, total] = await Promise.all([
      this.prisma.productReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.productReview.count({ where }),
    ])

    return { items: reviews, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async updateStatus(id: string, status: ReviewStatus) {
    const review = await this.prisma.productReview.findUnique({ where: { id } })
    if (!review) throw new NotFoundException('Review not found')

    return this.prisma.productReview.update({ where: { id }, data: { status } })
  }

  async deleteReview(id: string) {
    const review = await this.prisma.productReview.findUnique({ where: { id } })
    if (!review) throw new NotFoundException('Review not found')
    await this.prisma.productReview.delete({ where: { id } })
    return { success: true }
  }

  async createReview(userId: string, data: {
    productId: string
    orderId: string
    orderItemId: string
    rating: number
    comment?: string
  }) {
    const existing = await this.prisma.productReview.findUnique({
      where: { userId_orderItemId: { userId, orderItemId: data.orderItemId } },
    })
    if (existing) throw new BadRequestException('Review already submitted for this item')

    return this.prisma.productReview.create({
      data: { ...data, userId, status: ReviewStatus.PENDING },
    })
  }

  async getProductReviews(productId: string) {
    return this.prisma.productReview.findMany({
      where: { productId, status: ReviewStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    })
  }
}
