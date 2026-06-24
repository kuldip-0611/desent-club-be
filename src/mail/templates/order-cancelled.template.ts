import { resolveSiteUrl } from '../../common/site.constants'
import { baseLayout, orderBadge, ctaButton, infoTable, divider, alertBox } from './base.template'

export interface OrderCancelledData {
  name: string
  orderId: string
  reason?: string
  total: number
  paymentMethod: 'ONLINE' | 'COD'
  siteUrl?: string
}

export function buildOrderCancelledEmail(data: OrderCancelledData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = resolveSiteUrl(data.siteUrl)
  const willRefund = data.paymentMethod === 'ONLINE'

  const content = `
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Order Cancelled ❌
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, your order has been cancelled as requested.
    </p>

    ${orderBadge(data.orderId)}

    ${infoTable([
      { label: 'Order Reference', value: `#${ref}` },
      { label: 'Order Total', value: `₹${data.total.toFixed(2)}` },
      ...(data.reason ? [{ label: 'Cancellation Reason', value: data.reason }] : []),
    ])}

    ${willRefund
      ? alertBox('💰 Since you paid online, a full refund of <strong>₹' + data.total.toFixed(2) + '</strong> will be processed to your original payment method within 5–7 business days.', 'success')
      : alertBox('This was a COD order, so no payment was charged. No refund action is needed.', 'info')}

    ${divider}

    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#f5f3ff,#ede9fe);border:1px solid #ddd6fe;border-radius:16px;margin:0 0 24px;text-align:center">
      <tr>
        <td style="padding:28px 32px">
          <div style="font-size:36px;margin-bottom:12px">🛍️</div>
          <h3 style="margin:0 0 8px;font-size:17px;font-weight:700;color:#4f46e5">Browse Our Latest Collection</h3>
          <p style="margin:0 0 20px;font-size:14px;color:#6d28d9;line-height:1.6">
            We have new arrivals every week — discover something you'll love!
          </p>
          ${ctaButton('Shop Now', `${siteUrl}/products`)}
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      Questions? Contact us at
      <a href="mailto:support@disentclub.com" style="color:#6366f1;text-decoration:none">support@disentclub.com</a>
    </p>`

  return baseLayout({
    preheader: `Your order #${ref} has been cancelled${willRefund ? ` — refund of ₹${data.total.toFixed(2)} initiated` : ''}`,
    content,
  })
}
