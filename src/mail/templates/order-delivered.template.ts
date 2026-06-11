import { baseLayout, orderBadge, ctaButton, divider, alertBox } from './base.template'

export interface OrderDeliveredData {
  name: string
  orderId: string
  siteUrl?: string
}

export function buildOrderDeliveredEmail(data: OrderDeliveredData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = data.siteUrl ?? 'https://desentclub.com'

  const content = `
    <!-- Heading -->
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Order Delivered! ✅
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, your order has been delivered.
      We hope you love your new Desent Club pieces!
    </p>

    ${orderBadge(data.orderId)}

    ${alertBox('🎉 Order <strong>#' + ref + '</strong> has been successfully delivered to your address.', 'success')}

    ${divider}

    <!-- Review CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#faf5ff,#ede9fe);border:1px solid #ddd6fe;border-radius:16px;margin:0 0 24px">
      <tr>
        <td style="padding:28px 32px;text-align:center">
          <div style="font-size:36px;margin-bottom:12px">⭐</div>
          <h3 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#4f46e5">Enjoy your purchase?</h3>
          <p style="margin:0 0 20px;font-size:14px;color:#6d28d9;line-height:1.6">
            Your review helps thousands of shoppers make the right choice.
            Share your experience — it only takes 30 seconds!
          </p>
          ${ctaButton('✍️ Write a Review', `${siteUrl}/orders/${data.orderId}`)}
        </td>
      </tr>
    </table>

    ${divider}

    <!-- Return info -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:0 0 20px">
      <tr>
        <td style="padding:20px 24px">
          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1e293b">Something not right?</p>
          <p style="margin:0 0 12px;font-size:14px;color:#64748b;line-height:1.6">
            You can request a return or size exchange within <strong>3 days of delivery</strong>
            directly from the app. We'll schedule a free doorstep pickup.
          </p>
          <a href="${siteUrl}/orders/${data.orderId}" style="font-size:14px;font-weight:600;color:#4f46e5;text-decoration:none">
            Raise a Return Request →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      Thank you for shopping with Desent Club! 🙏<br/>
      We'd love to see you again soon.
    </p>`

  return baseLayout({
    preheader: `Your Desent Club order #${ref} has been delivered — share your experience!`,
    content,
  })
}
