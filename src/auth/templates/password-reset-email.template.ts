import { baseLayout, ctaButton } from '../../mail/templates/base.template'

export function buildPasswordResetEmail(resetLink: string): {
  subject: string
  text: string
  html: string
} {
  const subject = 'Reset your password - Disent Club'

  const text = [
    'You requested a password reset for your Disent Club account.',
    '',
    `Reset your password: ${resetLink}`,
    '',
    'This link expires in 1 hour.',
    'If you did not request this, you can ignore this email.',
  ].join('\n')

  const content = `
    <h2 style="margin:0 0 6px;font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px">
      Reset your password 🔐
    </h2>
    <p style="margin:0 0 28px;font-size:16px;color:#64748b;line-height:1.6">
      We received a request to reset the password for your
      <strong style="color:#1e293b">Disent Club</strong> account.
      Click the button below to choose a new password.
    </p>

    ${ctaButton('Reset Password', resetLink)}

    <!-- Security note -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0">
      <tr>
        <td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;font-size:13px;color:#92400e;line-height:1.6">
          ⚠️ This link expires in <strong>1 hour</strong>.
          If you did not request a password reset, you can safely ignore this email — your password will not change.
        </td>
      </tr>
    </table>

  `

  const html = baseLayout({
    preheader: 'Reset your Disent Club password — link expires in 1 hour',
    content,
  })

  return { subject, text, html }
}
