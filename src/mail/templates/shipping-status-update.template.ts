import { resolveSiteUrl } from '../../common/site.constants'
import { baseLayout, orderBadge, ctaButton, infoTable, divider, sectionHeading, alertBox } from './base.template'

export interface ShippingStatusUpdateData {
  name: string
  orderId: string
  shippingStatus: string   // raw Shiprocket status e.g. "PICKED UP"
  courierName?: string | null
  awbCode?: string | null
  trackingUrl?: string | null
  siteUrl?: string
}

interface StatusMeta {
  emoji: string
  headline: string
  subtext: string
  alertType: 'info' | 'success' | 'warning'
  alertText: string
  // Which steps are done/active in the progress bar
  // Order Placed → Picked Up → In Transit → Out for Delivery → Delivered
  stepIndex: number
}

const STATUS_META: Record<string, StatusMeta> = {
  'PICKUP SCHEDULED': {
    emoji: '📅',
    headline: 'Pickup Scheduled',
    subtext: 'Great news! A pickup has been scheduled for your order.',
    alertType: 'info',
    alertText: '🗓️ Our courier partner will collect your package from the warehouse soon.',
    stepIndex: 1,
  },
  'PICKUP GENERATED': {
    emoji: '📅',
    headline: 'Pickup Generated',
    subtext: 'Your order pickup has been generated and is awaiting collection.',
    alertType: 'info',
    alertText: '🗓️ Our courier partner will collect your package from the warehouse soon.',
    stepIndex: 1,
  },
  'PICKED UP': {
    emoji: '📦',
    headline: 'Order Picked Up',
    subtext: 'Your package has been picked up from our warehouse.',
    alertType: 'info',
    alertText: '📦 Your order has been collected by the courier partner and is being processed at their facility.',
    stepIndex: 2,
  },
  'MANIFESTED': {
    emoji: '📦',
    headline: 'Package Manifested',
    subtext: 'Your package has been scanned and logged at the courier hub.',
    alertType: 'info',
    alertText: '📦 Your order is at the courier hub and will be dispatched to the transit network soon.',
    stepIndex: 2,
  },
  'IN TRANSIT': {
    emoji: '🚚',
    headline: 'Order In Transit',
    subtext: 'Your package is on its way to you!',
    alertType: 'info',
    alertText: '🚚 Your order is moving through the courier network and heading to your city.',
    stepIndex: 3,
  },
  'OUT FOR DELIVERY': {
    emoji: '🏠',
    headline: 'Out for Delivery!',
    subtext: 'Your package is out for delivery today — please be available to receive it.',
    alertType: 'success',
    alertText: '🏠 Your order is with the delivery agent and will reach you today. Please keep your phone handy!',
    stepIndex: 4,
  },
  'NDR': {
    emoji: '⚠️',
    headline: 'Delivery Attempt Failed',
    subtext: 'Our courier attempted delivery but was unable to reach you.',
    alertType: 'warning',
    alertText: '⚠️ Please ensure someone is available at the delivery address, or contact our courier partner to reschedule.',
    stepIndex: 3,
  },
}

const STEPS = [
  'Order Placed',
  'Picked Up',
  'In Transit',
  'Out for Delivery',
  'Delivered',
]

function buildTimeline(activeStep: number): string {
  const cells = STEPS.map((label, i) => {
    const done = i < activeStep
    const active = i === activeStep
    return `
      <td style="text-align:center;vertical-align:top;width:20%;padding:0 4px">
        <div style="width:28px;height:28px;border-radius:50%;margin:0 auto 6px;line-height:28px;font-size:12px;font-weight:700;
          ${active ? 'background:#4f46e5;color:#fff;box-shadow:0 0 0 4px #ede9fe' : done ? 'background:#22c55e;color:#fff' : 'background:#e2e8f0;color:#94a3b8'}">
          ${done ? '✓' : active ? '●' : i + 1}
        </div>
        <div style="font-size:10px;font-weight:${active ? '700' : '500'};
          color:${active ? '#4f46e5' : done ? '#22c55e' : '#94a3b8'};
          line-height:1.3">${label}</div>
      </td>`
  }).join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:8px 0 24px">
      <tr>
        <td style="padding:20px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>${cells}</tr>
          </table>
        </td>
      </tr>
    </table>`
}

export function buildShippingStatusUpdateEmail(data: ShippingStatusUpdateData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = resolveSiteUrl(data.siteUrl)
  const meta = STATUS_META[data.shippingStatus.toUpperCase()]

  // Fallback for unknown statuses
  if (!meta) {
    return baseLayout({
      preheader: `Update on your Disent Club order #${ref}`,
      content: `
        <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
          Order Update 📬
        </h2>
        <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
          Hi <strong style="color:#1e293b">${data.name}</strong>, there's a new update on your order.
        </p>
        ${orderBadge(data.orderId)}
        ${infoTable([
          { label: 'Current Status', value: `<strong>${data.shippingStatus}</strong>` },
          ...(data.courierName ? [{ label: 'Courier', value: data.courierName }] : []),
          ...(data.awbCode ? [{ label: 'AWB Code', value: data.awbCode }] : []),
        ])}
        ${ctaButton('View Order', `${siteUrl}/orders/${data.orderId}`)}
      `,
    })
  }

  const trackingRows = [
    ...(data.courierName ? [{ label: 'Courier Partner', value: data.courierName }] : []),
    ...(data.awbCode ? [{ label: 'Tracking Number (AWB)', value: `<span style="color:#4f46e5;font-weight:700">${data.awbCode}</span>` }] : []),
    { label: 'Current Status', value: `<strong>${meta.headline}</strong>` },
  ]

  const content = `
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      ${meta.emoji} ${meta.headline}
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, ${meta.subtext}
    </p>

    ${orderBadge(data.orderId)}

    ${alertBox(meta.alertText, meta.alertType)}

    ${divider}

    ${sectionHeading('Shipment Details')}
    ${infoTable(trackingRows)}

    ${divider}

    ${sectionHeading('Delivery Progress')}
    ${buildTimeline(meta.stepIndex)}

    ${data.trackingUrl
      ? ctaButton('🔍 Track My Package', data.trackingUrl)
      : ctaButton('View Order Details', `${siteUrl}/orders/${data.orderId}`)
    }

    ${divider}

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      Questions about your delivery? Contact us at
      <a href="mailto:support@disentclub.com" style="color:#6366f1;text-decoration:none">support@disentclub.com</a>
    </p>`

  return baseLayout({
    preheader: `${meta.emoji} ${meta.headline} — Order #${ref} | Disent Club`,
    content,
    siteUrl,
  })
}
