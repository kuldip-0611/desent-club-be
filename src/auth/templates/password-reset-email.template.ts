export function buildPasswordResetEmail(resetLink: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Reset your password - Desent Club';
  const text = [
    'You requested a password reset for your Desent Club account.',
    '',
    `Reset your password: ${resetLink}`,
    '',
    'This link expires in 1 hour.',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

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
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;background-color:#111827;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Desent Club</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">Reset your password</h1>
              <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                Click the button below to choose a new password. This link is valid for one hour.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px 28px;text-align:center;">
              <a href="${resetLink}" style="display:inline-block;background:linear-gradient(90deg,#38bdf8,#6366f1);color:#0f172a;font-size:14px;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:10px;">
                Reset password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;word-break:break-all;">
                Or copy this link: ${resetLink}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
