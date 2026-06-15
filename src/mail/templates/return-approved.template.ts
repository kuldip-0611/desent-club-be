import { resolveSiteUrl } from '../../common/site.constants'
import { baseLayout, orderBadge, ctaButton, infoTable, divider, alertBox } from './base.template'

export interface ReturnApprovedData {
  name: string
  orderId: string
  awbCode?: string | null
  courierName?: string | null
  returnType: 'RETURN' | 'EXCHANGE'
  exchangeSize?: string | null
  siteUrl?: string
}

export function buildReturnApprovedEmail(data: ReturnApprovedData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = resolveSiteUrl(data.siteUrl)
  const isExchange = data.returnType === 'EXCHANGE'

  const content = `
    <!-- Heading -->
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      ${isExchange ? 'Exchange Approved! 🔄' : 'Return Approved! ✅'}
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, your ${isExchange ? 'exchange' : 'return'} request has been approved.
      ${isExchange
        ? `A courier will pick up your item and we'll dispatch size <strong>${data.exchangeSize}</strong> once received.`
        : 'A courier will be scheduled to pick up the item from your doorstep.'}
    </p>

    ${orderBadge(data.orderId)}

    ${data.awbCode
      ? infoTable([
          { label: 'Order Reference', value: `#${ref}` },
          ...(data.courierName ? [{ label: 'Pickup Courier', value: data.courierName }] : []),
          { label: 'Return AWB / Tracking', value: `<span style="color:#4f46e5;font-weight:700">${data.awbCode}</span>` },
          ...(isExchange && data.exchangeSize ? [{ label: 'Exchange Size', value: data.exchangeSize, highlight: true }] : []),
        ])
      : alertBox('Our courier partner will contact you to schedule the pickup. Keep your item ready.', 'info')}

    ${divider}

    <!-- Instructions -->
    <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8">What to do next</p>

    ${[
      {
        num: '1',
        icon: '📦',
        title: 'Pack the item securely',
        desc: 'Use the original packaging if available. Include all tags, accessories, and the original invoice.',
      },
      {
        num: '2',
        icon: '🚪',
        title: 'Be available for pickup',
        desc: 'Our courier partner will contact you to schedule the pickup from your doorstep.',
      },
      {
        num: '3',
        icon: isExchange ? '🚚' : '💰',
        title: isExchange ? 'Receive your new size' : 'Receive your refund',
        desc: isExchange
          ? `Once we receive and inspect the item, we'll dispatch size ${data.exchangeSize ?? 'your requested size'} within 2–3 business days.`
          : 'Once we receive and inspect the item, your refund will be processed within 5–7 business days.',
      },
    ].map(step => `
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px">
        <tr>
          <td style="padding:16px 20px">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="width:40px;vertical-align:top">
                  <div style="width:36px;height:36px;border-radius:50%;background:#ede9fe;color:#4f46e5;font-size:16px;line-height:36px;text-align:center">${step.icon}</div>
                </td>
                <td style="padding-left:14px;vertical-align:top">
                  <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px">
                    <span style="color:#4f46e5;font-weight:800;margin-right:6px">${step.num}.</span>${step.title}
                  </div>
                  <div style="font-size:13px;color:#64748b;line-height:1.6">${step.desc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`).join('')}

    ${divider}

    ${alertBox('⚠️ Please do not use the item before returning. Items with signs of use, damage, or missing tags may not be eligible for return/exchange.', 'warning')}

    ${ctaButton('Track Your Return', `${siteUrl}/orders/${data.orderId}`)}

    ${divider}

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      Need help? Contact us at
      <a href="mailto:support@desentclub.com" style="color:#6366f1;text-decoration:none">support@desentclub.com</a>
      with order reference <strong>#${ref}</strong>.
    </p>`

  return baseLayout({
    preheader: `Your ${isExchange ? 'exchange' : 'return'} request for order #${ref} has been approved — pickup scheduled`,
    content,
    logoUrl: `${siteUrl}/logo.png`,
  })
}
