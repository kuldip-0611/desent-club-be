import { baseLayout } from '../../mail/templates/base.template'

export function buildRegistrationOtpEmail(otp: string): {
  subject: string
  text: string
  html: string
} {
  const subject = 'Verify your email - Disent Club'

  const text = [
    'Welcome to Disent Club.',
    '',
    `Your email verification code is: ${otp}`,
    '',
    'This code expires in 5 minutes.',
    'If you did not request this, please ignore this email.',
  ].join('\n')

  const content = `
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Verify your email 📧
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      Welcome to <strong style="color:#1e293b">Disent Club</strong>!
      Use the one-time code below to complete your registration.
    </p>

    <!-- OTP Box -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px">
      <tr>
        <td align="center"
            style="background:#f8fafc;border:2px dashed #c7d2fe;border-radius:16px;padding:28px 20px">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8">
            Verification Code
          </p>
          <p style="margin:0;font-size:40px;font-weight:900;letter-spacing:0.25em;color:#4f46e5;font-variant-numeric:tabular-nums;line-height:1">
            ${otp}
          </p>
          <p style="margin:12px 0 0;font-size:13px;color:#94a3b8">
            Expires in <strong style="color:#1e293b">5 minutes</strong>
          </p>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6">
      🔒 Never share this code with anyone. Disent Club will never ask for it.
    </p>`

  const html = baseLayout({
    preheader: `${otp} is your Disent Club verification code`,
    content,
  })

  return { subject, text, html }
}
