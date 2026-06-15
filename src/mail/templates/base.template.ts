/** Shared base layout for all Desent Club transactional emails */
import { resolveSiteUrl } from '../../common/site.constants'

export function baseLayout(opts: {
  preheader?: string
  content: string
  year?: number
  /** Absolute URL of the brand logo image (e.g. https://disentclub.com/logo.png) */
  logoUrl?: string
  siteUrl?: string
}): string {
  const {
    preheader = '',
    content,
    year = new Date().getFullYear(),
    logoUrl,
    siteUrl = resolveSiteUrl(),
  } = opts

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Desent Club</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f1f5f9; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; }
    @media only screen and (max-width: 600px) {
      .mobile-padding { padding: 24px 20px !important; }
      .mobile-center { text-align: center !important; }
      .mobile-full { width: 100% !important; display: block !important; }
      .mobile-hide { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Inter','Segoe UI',Arial,sans-serif">

  <!-- Preheader (hidden preview text) -->
  ${preheader ? `<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden">${preheader}&nbsp;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;&#847;&zwnj;</div>` : ''}

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">

          <!-- ══ HEADER ══ -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 60%,#818cf8 100%);border-radius:20px 20px 0 0;padding:0;overflow:hidden">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:36px 48px">
                    <!-- Logo -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle">
                          ${logoUrl
                            ? `<img src="${logoUrl}" alt="Desent Club" width="130" height="auto" border="0"
                                 style="display:block;max-width:130px;height:auto" />`
                            : `<div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1">Desent<span style="color:#c7d2fe"> Club</span></div>
                               <div style="font-size:10px;color:rgba(255,255,255,0.6);letter-spacing:0.18em;text-transform:uppercase;margin-top:4px">Premium Fashion</div>`
                          }
                        </td>
                        <td align="right" style="vertical-align:middle;width:60px">
                          <!-- Decorative circle (table-based for email client compatibility) -->
                          <table cellpadding="0" cellspacing="0" border="0" align="right">
                            <tr>
                              <td width="56" height="56" style="width:56px;height:56px;border-radius:28px;background:rgba(255,255,255,0.12);font-size:0;line-height:0">&nbsp;</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ══ BODY ══ -->
          <tr>
            <td class="mobile-padding" style="background:#ffffff;padding:40px 48px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
              ${content}
            </td>
          </tr>

          <!-- ══ FOOTER ══ -->
          <tr>
            <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 20px 20px;padding:28px 48px;text-align:center">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <div style="font-size:18px;font-weight:900;color:#6366f1;letter-spacing:-0.3px;margin-bottom:12px">
                      Desent<span style="color:#c7d2fe"> Club</span>
                    </div>
                    <p style="margin:0 0 8px;font-size:13px;color:#64748b">
                      Need help? Email us at
                      <a href="mailto:support@desentclub.com" style="color:#6366f1;text-decoration:none;font-weight:600">support@desentclub.com</a>
                    </p>
                    <p style="margin:0 0 16px;font-size:12px;color:#94a3b8">
                      Mon–Sat, 10 AM – 7 PM IST
                    </p>
                    <!-- Social / links -->
                    <p style="margin:0;font-size:11px;color:#cbd5e1">
                      &copy; ${year} Desent Club &nbsp;·&nbsp;
                      <a href="${siteUrl}" style="color:#94a3b8;text-decoration:none">Visit Store</a>
                      &nbsp;·&nbsp;
                      <a href="${siteUrl}/support" style="color:#94a3b8;text-decoration:none">Support</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

/** Indigo pill badge for order reference */
export function orderBadge(orderId: string): string {
  const ref = orderId.slice(-8).toUpperCase()
  return `
    <div style="text-align:center;margin:20px 0">
      <span style="display:inline-block;background:#ede9fe;color:#4f46e5;font-size:14px;font-weight:700;padding:8px 20px;border-radius:999px;letter-spacing:0.06em;border:1px solid #ddd6fe">
        Order #${ref}
      </span>
    </div>`
}

/** Colored status badge */
export function statusBadge(label: string, color: 'green' | 'indigo' | 'amber' | 'red'): string {
  const styles: Record<string, string> = {
    green:  'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0',
    indigo: 'background:#ede9fe;color:#4f46e5;border:1px solid #ddd6fe',
    amber:  'background:#fef9c3;color:#92400e;border:1px solid #fde68a',
    red:    'background:#fee2e2;color:#b91c1c;border:1px solid #fecaca',
  }
  return `<span style="display:inline-block;${styles[color]};font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;letter-spacing:0.05em;text-transform:uppercase">${label}</span>`
}

/** CTA button */
export function ctaButton(label: string, href: string, color = '#4f46e5'): string {
  return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0">
      <tr>
        <td align="center" style="border-radius:12px;background:${color}">
          <a href="${href}" target="_blank"
             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;letter-spacing:0.01em">
            ${label}
          </a>
        </td>
      </tr>
    </table>`
}

/** Info row table */
export function infoTable(rows: Array<{ label: string; value: string; highlight?: boolean }>): string {
  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td style="font-size:14px;color:#64748b;padding:10px 0;${i > 0 ? 'border-top:1px solid #f1f5f9' : ''}">${r.label}</td>
      <td style="font-size:${r.highlight ? '16px' : '14px'};font-weight:${r.highlight ? '700' : '600'};color:${r.highlight ? '#4f46e5' : '#1e293b'};text-align:right;padding:10px 0;${i > 0 ? 'border-top:1px solid #f1f5f9' : ''}">${r.value}</td>
    </tr>`).join('')

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;margin:20px 0">
      <tr>
        <td style="padding:4px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    </table>`
}

/** Alert box */
export function alertBox(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): string {
  const styles: Record<string, string> = {
    info:    'background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af',
    success: 'background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d',
    warning: 'background:#fffbeb;border:1px solid #fde68a;color:#92400e',
    error:   'background:#fef2f2;border:1px solid #fecaca;color:#b91c1c',
  }
  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
      <tr>
        <td style="${styles[type]};border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.6;font-weight:500">
          ${message}
        </td>
      </tr>
    </table>`
}

/** Section heading */
export function sectionHeading(text: string): string {
  return `<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8">${text}</p>`
}

/** Divider */
export const divider = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0"><tr><td style="height:1px;background:#f1f5f9"></td></tr></table>`
