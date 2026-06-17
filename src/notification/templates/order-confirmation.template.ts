interface OrderItem {
  name: string
  size: string
  color: string
  quantity: number
  unitPrice: number
  total: number
}

interface OrderConfirmationPayload {
  userName: string
  orderId: string
  items: OrderItem[]
  subtotal: number
  discountAmount: number
  total: number
  shippingAddress?: {
    fullName?: string
    line1?: string
    line2?: string | null
    city?: string
    state?: string
    pincode?: string
    country?: string
  } | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n)

export function buildOrderConfirmationEmail(payload: OrderConfirmationPayload): {
  subject: string
  text: string
  html: string
} {
  const { userName, orderId, items, subtotal, discountAmount, total, shippingAddress } = payload
  const shortId = orderId.slice(-8).toUpperCase()
  const greeting = userName ? `Hi ${userName},` : 'Hello,'

  const subject = `Order Confirmed! #${shortId} — Disent Club`

  // ── plain text ──────────────────────────────────────────────────────────────
  const itemLines = items
    .map((i) => `  • ${i.name} (${i.size}${i.color ? ` / ${i.color}` : ''}) × ${i.quantity} — ${fmt(i.total)}`)
    .join('\n')

  const addressLine = shippingAddress
    ? [
        shippingAddress.fullName,
        shippingAddress.line1,
        shippingAddress.line2,
        `${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.pincode}`,
        shippingAddress.country,
      ]
        .filter(Boolean)
        .join(', ')
    : 'Not provided'

  const text = [
    greeting,
    '',
    `Your order #${shortId} has been confirmed. Thank you for shopping with Disent Club!`,
    '',
    'ITEMS ORDERED',
    itemLines,
    '',
    `Subtotal   : ${fmt(subtotal)}`,
    ...(discountAmount > 0 ? [`Discount   : -${fmt(discountAmount)}`] : []),
    `Total      : ${fmt(total)}`,
    '',
    `Shipping to: ${addressLine}`,
    '',
    'We will notify you when your order ships.',
    '— Disent Club Team',
  ].join('\n')

  // ── HTML ────────────────────────────────────────────────────────────────────
  const itemRowsHtml = items
    .map(
      (i) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">
          ${i.name}
          <span style="display:block;font-size:12px;color:#6b7280;margin-top:2px;">
            Size: ${i.size}${i.color ? ` &nbsp;·&nbsp; Colour: ${i.color}` : ''} &nbsp;·&nbsp; Qty: ${i.quantity}
          </span>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;text-align:right;white-space:nowrap;">
          ${fmt(i.total)}
        </td>
      </tr>`,
    )
    .join('')

  const discountRowHtml =
    discountAmount > 0
      ? `<tr>
          <td style="padding:6px 0;font-size:13px;color:#059669;">Discount</td>
          <td style="padding:6px 0;font-size:13px;color:#059669;text-align:right;">-${fmt(discountAmount)}</td>
        </tr>`
      : ''

  const addressHtml = shippingAddress
    ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;">
        <tr>
          <td style="padding:16px;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
            <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:600;">Shipping Address</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
              ${[
                shippingAddress.fullName,
                shippingAddress.line1,
                shippingAddress.line2,
                `${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.pincode}`,
                shippingAddress.country,
              ]
                .filter(Boolean)
                .join('<br />')}
            </p>
          </td>
        </tr>
      </table>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 20px 32px;background-color:#111827;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Disent Club</p>
              <h1 style="margin:10px 0 0 0;font-size:24px;font-weight:700;color:#ffffff;">Order Confirmed! ✅</h1>
              <p style="margin:10px 0 0 0;font-size:14px;color:#d1d5db;line-height:1.6;">
                ${greeting.replace(/</g, '&lt;')} Your order has been placed and is being prepared.
              </p>
            </td>
          </tr>

          <!-- Order ID badge -->
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <div style="display:inline-block;background-color:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:8px 16px;">
                <span style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;">Order ID</span>
                <span style="margin-left:10px;font-size:15px;font-weight:700;color:#111827;letter-spacing:0.05em;">#${shortId}</span>
              </div>
            </td>
          </tr>

          <!-- Items -->
          <tr>
            <td style="padding:20px 32px 0 32px;">
              <p style="margin:0 0 10px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Items Ordered</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${itemRowsHtml}
              </table>
            </td>
          </tr>

          <!-- Totals -->
          <tr>
            <td style="padding:16px 32px 0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding:6px 0;font-size:13px;color:#6b7280;">Subtotal</td>
                  <td style="padding:6px 0;font-size:13px;color:#6b7280;text-align:right;">${fmt(subtotal)}</td>
                </tr>
                ${discountRowHtml}
                <tr>
                  <td style="padding:10px 0 6px 0;font-size:16px;font-weight:700;color:#111827;border-top:2px solid #111827;">Total Paid</td>
                  <td style="padding:10px 0 6px 0;font-size:16px;font-weight:700;color:#111827;text-align:right;border-top:2px solid #111827;">${fmt(total)}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping address -->
          <tr>
            <td style="padding:0 32px;">
              ${addressHtml}
            </td>
          </tr>

          <!-- Footer note -->
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              <p style="margin:0;font-size:13px;line-height:1.7;color:#4b5563;">
                We'll send you another email when your order ships with tracking details. If you have any questions, reply to this email.
              </p>
              <p style="margin:20px 0 0 0;font-size:12px;color:#9ca3af;">— Disent Club Team</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
