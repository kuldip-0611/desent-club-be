/**
 * Send a test email via Resend.
 * Usage: node scripts/test-resend-email.js [recipient]
 */
require('dotenv').config();
const { Resend } = require('resend');

const to = process.argv[2] || 'kuldip0611@yopmail.com';
const apiKey = process.env.RESEND_API_KEY?.trim();
const from =
  process.env.RESEND_FROM?.trim() || 'Desent Club <testinfo@disentclub.com>';

async function main() {
  if (!apiKey) {
    console.error('RESEND_API_KEY is missing in .env');
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: 'Desent Club — Resend test email',
    text: 'This is a test email from Desent Club backend. Resend is configured correctly.',
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h1 style="color:#4f46e5;margin:0 0 12px">Desent Club</h1>
        <p style="color:#334155;line-height:1.6">
          This is a test email from the Desent Club backend.
          <strong>Resend is configured correctly.</strong>
        </p>
        <p style="color:#64748b;font-size:13px">Sent from ${from}</p>
      </div>
    `,
  });

  if (error) {
    console.error('Resend error:', error);
    process.exit(1);
  }

  console.log(`Test email sent to ${to}`);
  console.log('Resend id:', data?.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
