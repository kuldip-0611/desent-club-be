import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service'
import { ShiprocketService } from './shiprocket.service'
import { MailService } from '../mail/mail.service'
import { OrderStatus } from '@prisma/client'

const SHIPROCKET_TO_ORDER_STATUS: Record<string, OrderStatus> = {
  // ── Stage 1: Warehouse / pre-dispatch → PROCESSING ──────────────────────
  'LABEL GENERATED':   OrderStatus.PROCESSING,
  'PICKUP SCHEDULED':  OrderStatus.PROCESSING,
  'PICKUP GENERATED':  OrderStatus.PROCESSING,
  'READY TO SHIP':     OrderStatus.PROCESSING,
  'PICKED UP':         OrderStatus.PROCESSING, // courier collected from warehouse — NOT yet in network
  'PICKUP DONE':       OrderStatus.PROCESSING,
  'MANIFESTED':        OrderStatus.PROCESSING, // courier hub scanned it in

  // ── Stage 2: In courier network → SHIPPED ───────────────────────────────
  'SHIPPED':           OrderStatus.SHIPPED,
  'IN TRANSIT':        OrderStatus.SHIPPED,
  'OUT FOR DELIVERY':  OrderStatus.SHIPPED,
  'UNDELIVERED':       OrderStatus.SHIPPED,
  'NDR':               OrderStatus.SHIPPED,
  'RTO INITIATED':     OrderStatus.SHIPPED,

  // ── Stage 3: Final states ────────────────────────────────────────────────
  'DELIVERED':         OrderStatus.DELIVERED,
  'RTO DELIVERED':     OrderStatus.CANCELLED,
  'CANCELLED':         OrderStatus.CANCELLED,
}

// Statuses that trigger a user email notification
const EMAIL_WORTHY_STATUSES = new Set([
  'PICKUP SCHEDULED', 'PICKED UP', 'MANIFESTED', 'IN TRANSIT', 'OUT FOR DELIVERY', 'NDR',
])

@Injectable()
export class ShiprocketSyncService {
  private readonly logger = new Logger(ShiprocketSyncService.name)

  constructor(
    private prisma: PrismaService,
    private shiprocket: ShiprocketService,
    private mail: MailService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncShipmentStatuses() {
    const orders = await this.prisma.order.findMany({
      where: {
        awbCode: { not: null },
        status: { in: [OrderStatus.PROCESSING, OrderStatus.SHIPPED] },
      },
      select: {
        id: true, awbCode: true, status: true, shippingStatus: true,
        userId: true, courierName: true, trackingUrl: true,
      },
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
        const data = await res.json() as { tracking_data?: { shipment_status?: string | number; shipment_track?: Array<{ current_status?: string }> } }
        const rawStatus = data?.tracking_data?.shipment_track?.[0]?.current_status
          ?? data?.tracking_data?.shipment_status
        const srStatus = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined
        if (!srStatus) continue

        const newStatus = SHIPROCKET_TO_ORDER_STATUS[srStatus]
        const statusChanged = newStatus && newStatus !== order.status
        const shippingStatusChanged = srStatus !== order.shippingStatus

        if (statusChanged || shippingStatusChanged) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: {
              ...(statusChanged ? { status: newStatus } : {}),
              shippingStatus: srStatus,
            },
          })
          if (statusChanged) this.logger.log(`Order ${order.id}: ${order.status} → ${newStatus} (shippingStatus: ${srStatus})`)
          else this.logger.log(`Order ${order.id}: shippingStatus updated to "${srStatus}" (order status unchanged)`)

          // Send email for meaningful status changes
          if (shippingStatusChanged && EMAIL_WORTHY_STATUSES.has(srStatus)) {
            const user = await this.prisma.user.findUnique({
              where: { id: order.userId },
              select: { email: true, name: true },
            })
            if (user?.email) {
              const safeUrl = order.trackingUrl?.startsWith('sr_shipment:') ? null : order.trackingUrl
              if (newStatus === OrderStatus.DELIVERED) {
                this.mail.sendOrderDelivered({ to: user.email, name: user.name, orderId: order.id })
                  .catch((err: Error) => this.logger.error(`Delivered email failed: ${err?.message}`))
              } else {
                this.mail.sendShippingStatusUpdate({
                  to: user.email, name: user.name, orderId: order.id,
                  shippingStatus: srStatus, courierName: order.courierName,
                  awbCode: order.awbCode, trackingUrl: safeUrl,
                }).catch((err: Error) => this.logger.error(`Shipping status email failed: ${err?.message}`))
              }
            }
          }
        }
      } catch (err) {
        this.logger.error(`Failed to sync order ${order.id}: ${(err as Error).message}`)
      }
    }
  }
}
