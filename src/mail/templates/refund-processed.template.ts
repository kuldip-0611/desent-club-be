import { resolveSiteUrl } from '../../common/site.constants'
import { baseLayout, orderBadge, ctaButton, infoTable, divider, alertBox } from './base.template'

export interface RefundProcessedData {
  name: string
  orderId: string
  amount: number
  refundId?: string | null
  paymentMethod: 'ONLINE' | 'COD'
  siteUrl?: string
}

export function buildRefundProcessedEmail(data: RefundProcessedData): string {
  const ref = data.orderId.slice(-8).toUpperCase()
  const siteUrl = resolveSiteUrl(data.siteUrl)
  const isCod = data.paymentMethod === 'COD'

  const refundNote = isCod
    ? 'Since this was a COD order, your refund will be processed via <strong>bank transfer</strong>. Please ensure your bank details are up to date in your profile.'
    : 'Your refund has been initiated to your original payment method (card/UPI/net banking). It typically reflects within <strong>5–7 business days</strong>.'

  const rows = [
    { label: 'Order Reference', value: `#${ref}` },
    { label: 'Refund Amount', value: `₹${data.amount.toFixed(2)}`, highlight: true },
    { label: 'Refund Method', value: isCod ? 'Bank Transfer' : 'Original Payment Method' },
    ...(data.refundId ? [{ label: 'Refund ID', value: data.refundId }] : []),
    { label: 'Processing Time', value: isCod ? '7–10 business days' : '5–7 business days' },
  ]

  const content = `
    <!-- Heading -->
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Refund Initiated 💰
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Hi <strong style="color:#1e293b">${data.name}</strong>, your refund has been processed.
      We're sorry things didn't work out — here are the details.
    </p>

    ${orderBadge(data.orderId)}

    <!-- Refund amount highlight -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #bbf7d0;border-radius:16px;margin:0 0 24px;text-align:center">
      <tr>
        <td style="padding:28px 32px">
          <div style="font-size:13px;font-weight:600;color:#15803d;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Refund Amount</div>
          <div style="font-size:42px;font-weight:900;color:#15803d;letter-spacing:-1px">₹${data.amount.toFixed(2)}</div>
          <div style="font-size:13px;color:#16a34a;margin-top:8px">Being processed to your account</div>
        </td>
      </tr>
    </table>

    ${infoTable(rows)}

    ${divider}

    ${alertBox(refundNote, 'info')}

    <!-- Timeline -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:20px 0 24px">
      <tr>
        <td style="padding:20px 24px">
          <p style="margin:0 0 14px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8">Refund Timeline</p>
          ${[
            { step: '1', label: 'Return received & inspected', done: true },
            { step: '2', label: 'Refund initiated', done: true },
            { step: '3', label: 'Reflects in your account', done: false, note: isCod ? '7–10 business days' : '5–7 business days' },
          ].map(s => `
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px">
              <tr>
                <td style="width:32px;vertical-align:top">
                  <div style="width:28px;height:28px;border-radius:50%;background:${s.done ? '#22c55e' : '#e2e8f0'};color:${s.done ? '#fff' : '#94a3b8'};font-size:12px;font-weight:700;line-height:28px;text-align:center">${s.done ? '✓' : s.step}</div>
                </td>
                <td style="padding-left:12px;vertical-align:middle">
                  <div style="font-size:14px;font-weight:${s.done ? '600' : '400'};color:${s.done ? '#1e293b' : '#94a3b8'}">${s.label}</div>
                  ${s.note ? `<div style="font-size:12px;color:#94a3b8;margin-top:2px">${s.note}</div>` : ''}
                </td>
              </tr>
            </table>`).join('')}
        </td>
      </tr>
    </table>

    ${ctaButton('View Order Details', `${siteUrl}/orders/${data.orderId}`)}

    ${divider}

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      Questions about your refund? Email us at
      <a href="mailto:support@disentclub.com" style="color:#6366f1;text-decoration:none">support@disentclub.com</a>
      with your order reference <strong>#${ref}</strong>.
    </p>`

  return baseLayout({
    preheader: `Refund of ₹${data.amount.toFixed(2)} initiated for order #${ref}`,
    content,
    logoUrl: 'https://desent-club-dev-assets-382720393179-ap-southeast-2-an.s3.ap-southeast-2.amazonaws.com/brand/logo.png',
  })
}
