import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { ShiprocketService } from './shiprocket.service'
import { OrderStatus } from '@prisma/client'

const SHIPROCKET_TO_ORDER_STATUS: Record<string, OrderStatus> = {
  'PICKED UP': OrderStatus.PROCESSING,
  'IN TRANSIT': OrderStatus.SHIPPED,
  'OUT FOR DELIVERY': OrderStatus.SHIPPED,
  'DELIVERED': OrderStatus.DELIVERED,
  'UNDELIVERED': OrderStatus.SHIPPED,
  'RTO INITIATED': OrderStatus.SHIPPED,
  'RTO DELIVERED': OrderStatus.CANCELLED,
  'CANCELLED': OrderStatus.CANCELLED,
}

@Injectable()
export class ShiprocketSyncService {
  private readonly logger = new Logger(ShiprocketSyncService.name)

  constructor(
    private prisma: PrismaService,
    private shiprocket: ShiprocketService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncShipmentStatuses() {
    const orders = await this.prisma.order.findMany({
      where: {
        awbCode: { not: null },
        status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED] },
      },
      select: { id: true, awbCode: true, status: true },
    })

    if (!orders.length) return
    this.logger.log(`Syncing ${orders.length} active shipments from Shiprocket`)

    for (const order of orders) {
      try {
        const token = await this.shiprocket.getToken()
        const res = await fetch(
          `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${order.awbCode}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        const data = await res.json() as { tracking_data?: { shipment_status?: string } }
        const srStatus = data?.tracking_data?.shipment_status?.toUpperCase()
        if (!srStatus) continue

        const newStatus = SHIPROCKET_TO_ORDER_STATUS[srStatus]
        if (newStatus && newStatus !== order.status) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: newStatus },
          })
          this.logger.log(`Order ${order.id}: ${order.status} → ${newStatus}`)
        }
      } catch (err) {
        this.logger.error(`Failed to sync order ${order.id}: ${(err as Error).message}`)
      }
    }
  }
}
