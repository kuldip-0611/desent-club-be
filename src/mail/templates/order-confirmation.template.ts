import { baseLayout, orderBadge, ctaButton, infoTable, divider, sectionHeading, alertBox } from './base.template'

export interface OrderConfirmationData {
  name: string
  orderId: string
  items: Array<{
    name: string
    size?: string | null
    color?: string | null
    quantity: number
    unitPrice: number
    total: number
  }>
  subtotal: number
  discountAmount?: number
  couponCode?: string | null
  total: number
  paymentMethod: 'ONLINE' | 'COD'
  shippingAddress?: {
    fullName?: string
    line1?: string
    line2?: string
    city?: string
    state?: string
    pincode?: string
    phone?: string
  } | null
  siteUrl?: string
}

export function buildOrderConfirmationEmail(data: OrderConfirmationData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = data.siteUrl ?? 'https://desentclub.com'
  const isCod = data.paymentMethod === 'COD'

  // Items table
  const itemsRows = data.items.map(item => {
    const desc = [item.size, item.color].filter(Boolean).join(' / ')
    return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;vertical-align:top">
          <div style="font-weight:600">${item.name}</div>
          ${desc ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">${desc}</div>` : ''}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:center;vertical-align:top">×${item.quantity}</td>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;font-size:14px;font-weight:600;color:#1e293b;text-align:right;vertical-align:top">₹${item.total.toFixed(2)}</td>
      </tr>`
  }).join('')

  const addr = data.shippingAddress
  const addressBlock = addr ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:8px 0 20px">
      <tr>
        <td style="padding:16px 20px;font-size:14px;color:#475569;line-height:1.7">
          <strong style="color:#1e293b">${addr.fullName ?? data.name}</strong><br/>
          ${addr.line1 ?? ''}${addr.line2 ? ', ' + addr.line2 : ''}<br/>
          ${addr.city ?? ''}, ${addr.state ?? ''} – ${addr.pincode ?? ''}<br/>
          ${addr.phone ? `📞 ${addr.phone}` : ''}
        </td>
      </tr>
    </table>` : ''

  const content = `
    <!-- Greeting -->
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Order Confirmed! 🎉
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, thank you for your purchase!
      We've received your order and it's being prepared with care.
    </p>

    ${orderBadge(data.orderId)}

    ${isCod ? alertBox('💵 This is a <strong>Cash on Delivery</strong> order. Please keep exact change ready at the time of delivery.', 'warning') : alertBox('✅ Payment received successfully. Your order is confirmed.', 'success')}

    ${divider}

    <!-- Items -->
    ${sectionHeading('Order Items')}
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:8px 0 0">
      <tr>
        <td style="padding:0 20px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <thead>
              <tr>
                <th style="padding:12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;text-align:left;border-bottom:1px solid #e2e8f0">Item</th>
                <th style="padding:12px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;text-align:center;border-bottom:1px solid #e2e8f0">Qty</th>
                <th style="padding:12px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#94a3b8;text-align:right;border-bottom:1px solid #e2e8f0">Total</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
        </td>
      </tr>
    </table>

    <!-- Totals -->
    ${infoTable([
      { label: 'Subtotal', value: `₹${data.subtotal.toFixed(2)}` },
      ...(data.discountAmount && data.discountAmount > 0
        ? [{ label: `Discount${data.couponCode ? ` (${data.couponCode})` : ''}`, value: `– ₹${data.discountAmount.toFixed(2)}` }]
        : []),
      { label: 'Shipping', value: 'Free 🎁' },
      { label: 'Order Total', value: `₹${data.total.toFixed(2)}`, highlight: true },
    ])}

    ${divider}

    <!-- Shipping Address -->
    ${sectionHeading('Shipping To')}
    ${addressBlock}

    <!-- CTA -->
    ${ctaButton('View Your Order', `${siteUrl}/orders/${data.orderId}`)}

    ${divider}

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      We'll send you another email when your order ships.
      Expected delivery in 4–7 business days.
    </p>`

  return baseLayout({
    preheader: `Your order #${ref} is confirmed — ₹${data.total.toFixed(2)}`,
    content,
    logoUrl: `${siteUrl}/logo.png`,
  })
}
