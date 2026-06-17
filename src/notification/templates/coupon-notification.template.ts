export function buildNewCouponEmail(coupon: {
  code: string;
  discountType: string;
  value: string;
  minSubtotal?: string | null;
  maxDiscount?: string | null;
  endsAt?: Date | null;
}): { subject: string; text: string; html: string } {
  const isPercent = coupon.discountType === 'PERCENT';
  const discountLabel = isPercent
    ? `${coupon.value}% off`
    : `₹${coupon.value} off`;

  const minNote =
    coupon.minSubtotal && Number(coupon.minSubtotal) > 0
      ? `Minimum order: ₹${coupon.minSubtotal}`
      : null;

  const maxNote =
    isPercent && coupon.maxDiscount && Number(coupon.maxDiscount) > 0
      ? `Max discount: ₹${coupon.maxDiscount}`
      : null;

  const expiryNote = coupon.endsAt
    ? `Valid until: ${new Date(coupon.endsAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`
    : null;

  const subject = `New Coupon Available: ${coupon.code} — ${discountLabel}`;

  const detailLines = [minNote, maxNote, expiryNote].filter(Boolean).join('\n');

  const text = [
    'Great news! A new coupon is now available on Disent Club.',
    '',
    `Use code: ${coupon.code}`,
    `Discount: ${discountLabel}`,
    ...(detailLines ? [detailLines] : []),
    '',
    'Shop now and save!',
    '— Disent Club Team',
  ].join('\n');

  const detailHtml = [minNote, maxNote, expiryNote]
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:4px 0;font-size:13px;color:#4b5563;">${line}</p>`,
    )
    .join('');

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
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Disent Club</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">New Coupon Just Dropped!</h1>
              <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                Use this exclusive code and save on your next order.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <div style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;">
                <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Your Coupon Code</p>
                <p style="margin:0 0 8px 0;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#111827;">${coupon.code}</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#059669;">${discountLabel}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              ${detailHtml}
              <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:#4b5563;">
                Apply this code at checkout to redeem your discount.
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

export function buildGroupCouponEmail(
  userName: string,
  groupName: string,
  coupon: {
    code: string;
    discountType: string;
    value: string;
    minSubtotal?: string | null;
    maxDiscount?: string | null;
    endsAt?: Date | null;
  },
): { subject: string; text: string; html: string } {
  const isPercent = coupon.discountType === 'PERCENT';
  const discountLabel = isPercent
    ? `${coupon.value}% off`
    : `₹${coupon.value} off`;

  const minNote =
    coupon.minSubtotal && Number(coupon.minSubtotal) > 0
      ? `Minimum order: ₹${coupon.minSubtotal}`
      : null;

  const maxNote =
    isPercent && coupon.maxDiscount && Number(coupon.maxDiscount) > 0
      ? `Max discount: ₹${coupon.maxDiscount}`
      : null;

  const expiryNote = coupon.endsAt
    ? `Valid until: ${new Date(coupon.endsAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`
    : null;

  const subject = `Exclusive Coupon for ${groupName} Members: ${coupon.code}`;

  const detailLines = [minNote, maxNote, expiryNote].filter(Boolean).join('\n');

  const greeting = userName ? `Hi ${userName},` : 'Hello,';

  const text = [
    greeting,
    '',
    `As a valued member of the "${groupName}" group, you now have exclusive access to a special coupon.`,
    '',
    `Use code: ${coupon.code}`,
    `Discount: ${discountLabel}`,
    ...(detailLines ? [detailLines] : []),
    '',
    'Shop now and enjoy your exclusive discount!',
    '— Disent Club Team',
  ].join('\n');

  const detailHtml = [minNote, maxNote, expiryNote]
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:4px 0;font-size:13px;color:#4b5563;">${line}</p>`,
    )
    .join('');

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
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Disent Club</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">Your Exclusive Coupon is Here!</h1>
              <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                ${greeting.replace('<', '&lt;')} This coupon is specially unlocked for <strong style="color:#ffffff;">${groupName}</strong> members.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <div style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;">
                <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Your Exclusive Coupon Code</p>
                <p style="margin:0 0 8px 0;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#111827;">${coupon.code}</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#059669;">${discountLabel}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              ${detailHtml}
              <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:#4b5563;">
                Apply this code at checkout to redeem your exclusive group discount.
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

export function buildDirectCouponEmail(
  userName: string,
  coupon: {
    code: string;
    discountType: string;
    value: string;
    minSubtotal?: string | null;
    maxDiscount?: string | null;
    endsAt?: Date | null;
  },
): { subject: string; text: string; html: string } {
  const isPercent = coupon.discountType === 'PERCENT';
  const discountLabel = isPercent
    ? `${coupon.value}% off`
    : `₹${coupon.value} off`;

  const minNote =
    coupon.minSubtotal && Number(coupon.minSubtotal) > 0
      ? `Minimum order: ₹${coupon.minSubtotal}`
      : null;

  const maxNote =
    isPercent && coupon.maxDiscount && Number(coupon.maxDiscount) > 0
      ? `Max discount: ₹${coupon.maxDiscount}`
      : null;

  const expiryNote = coupon.endsAt
    ? `Valid until: ${new Date(coupon.endsAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}`
    : null;

  const subject = `A Coupon Has Been Added to Your Account: ${coupon.code}`;
  const greeting = userName ? `Hi ${userName},` : 'Hello,';

  const detailLines = [minNote, maxNote, expiryNote].filter(Boolean).join('\n');

  const text = [
    greeting,
    '',
    'A coupon has been added to your Disent Club account.',
    '',
    `Use code: ${coupon.code}`,
    `Discount: ${discountLabel}`,
    ...(detailLines ? [detailLines] : []),
    '',
    'Apply it at checkout on your next order!',
    '— Disent Club Team',
  ].join('\n');

  const detailHtml = [minNote, maxNote, expiryNote]
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:4px 0;font-size:13px;color:#4b5563;">${line}</p>`,
    )
    .join('');

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
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af;">Disent Club</p>
              <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:700;line-height:1.3;color:#ffffff;">You Have a New Coupon!</h1>
              <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#d1d5db;">
                ${greeting.replace('<', '&lt;')} A coupon has been personally added to your account.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <div style="background-color:#f9fafb;border:1px dashed #d1d5db;border-radius:10px;padding:20px;text-align:center;">
                <p style="margin:0 0 6px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Your Coupon Code</p>
                <p style="margin:0 0 8px 0;font-size:28px;font-weight:700;letter-spacing:0.25em;color:#111827;">${coupon.code}</p>
                <p style="margin:0;font-size:16px;font-weight:600;color:#059669;">${discountLabel}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              ${detailHtml}
              <p style="margin:16px 0 0 0;font-size:13px;line-height:1.7;color:#4b5563;">
                Apply this code at checkout to redeem your discount.
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
