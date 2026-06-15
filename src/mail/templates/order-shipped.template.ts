import { resolveSiteUrl } from '../../common/site.constants'
import { baseLayout, orderBadge, ctaButton, infoTable, divider, sectionHeading, alertBox } from './base.template'

export interface OrderShippedData {
  name: string
  orderId: string
  courierName: string
  awbCode: string
  trackingUrl?: string | null
  estimatedDelivery?: string
  siteUrl?: string
}

export function buildOrderShippedEmail(data: OrderShippedData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = resolveSiteUrl(data.siteUrl)

  // Tracking timeline steps
  const steps = [
    { label: 'Order Placed', done: true },
    { label: 'Order Confirmed', done: true },
    { label: 'Dispatched', done: true, active: true },
    { label: 'Out for Delivery', done: false },
    { label: 'Delivered', done: false },
  ]

  const timeline = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:8px 0 24px;padding:0">
      <tr>
        <td style="padding:20px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${steps.map((s, i) => `
                <td style="text-align:center;vertical-align:top;width:20%;padding:0 4px">
                  <div style="width:28px;height:28px;border-radius:50%;margin:0 auto 6px;line-height:28px;font-size:12px;font-weight:700;
                    ${s.active ? 'background:#4f46e5;color:#fff;box-shadow:0 0 0 4px #ede9fe' : s.done ? 'background:#22c55e;color:#fff' : 'background:#e2e8f0;color:#94a3b8'}">
                    ${s.done ? '✓' : (i + 1)}
                  </div>
                  ${i < steps.length - 1 ? `
                    <div style="position:absolute;top:14px;left:50%;width:100%;height:2px;
                      background:${s.done ? '#22c55e' : '#e2e8f0'}"></div>` : ''}
                  <div style="font-size:10px;font-weight:${s.active ? '700' : '500'};
                    color:${s.active ? '#4f46e5' : s.done ? '#22c55e' : '#94a3b8'};
                    line-height:1.3">${s.label}</div>
                </td>`).join('')}
            </tr>
          </table>
        </td>
      </tr>
    </table>`

  const content = `
    <!-- Heading -->
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Your Order is on its Way! 🚚
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, great news!
      Your order has been dispatched and is heading straight to you.
    </p>

    ${orderBadge(data.orderId)}

    ${alertBox('📦 Your parcel has been handed over to the courier partner and is on its way!', 'info')}

    ${divider}

    ${sectionHeading('Shipment Details')}
    ${infoTable([
      { label: 'Courier Partner', value: data.courierName },
      { label: 'Tracking Number (AWB)', value: `<span style="color:#4f46e5;font-weight:700">${data.awbCode}</span>`, highlight: false },
      ...(data.estimatedDelivery ? [{ label: 'Estimated Delivery', value: data.estimatedDelivery }] : [{ label: 'Estimated Delivery', value: '4–7 business days' }]),
    ])}

    ${divider}

    ${sectionHeading('Shipment Progress')}
    ${timeline}

    ${data.trackingUrl ? ctaButton('🔍 Track My Package', data.trackingUrl) : ctaButton('View Order Details', `${siteUrl}/orders/${data.orderId}`)}

    ${divider}

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      If you have any questions about your delivery, reply to this email or contact
      <a href="mailto:support@desentclub.com" style="color:#6366f1;text-decoration:none">support@desentclub.com</a>
    </p>`

  return baseLayout({
    preheader: `Your order #${ref} has been shipped via ${data.courierName} — AWB: ${data.awbCode}`,
    content,
    logoUrl: `${siteUrl}/logo.png`,
  })
}
