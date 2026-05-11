export function buildRegistrationOtpEmail(otp: string): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = 'Verify your email - Desent Club';
  const text = [
    'Welcome to Desent Club.',
    '',
    `Your email verification code is: ${otp}`,
    '',
    'This code expires in 5 minutes.',
    'If you did not request this, please ignore this email.',
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
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">Verify your email address</h1>
              <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                Use this one-time password to complete your registration.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 8px 28px;">
              <div style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;">
                <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Verification code</p>
                <p style="margin:0;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#111827;font-variant-numeric:tabular-nums;">${otp}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.7;color:#4b5563;">
                This code expires in <strong style="color:#111827;">5 minutes</strong>. If you did not request this, you can safely ignore this message.
              </p>
              <p style="margin:12px 0 0 0;font-size:12px;line-height:1.6;color:#6b7280;">
                For security, never share this code with anyone.
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
