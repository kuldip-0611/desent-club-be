/**
 * After Razorpay payment is verified, run: deliver → return → refund.
 * Usage: node scripts/complete-order-after-payment.js <orderId>
 */
require('dotenv').config();

const API = process.env.API_URL || 'http://localhost:3001';
const USER = { email: process.env.E2E_USER_EMAIL || 'newuser06@yopmail.com', password: process.env.E2E_USER_PASSWORD || 'Kuldip@0611' };
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || 'admin@gmail.com', password: process.env.E2E_ADMIN_PASSWORD || 'Kuldip@0611' };

const orderId = process.argv[2];
if (!orderId) {
  console.error('Usage: node scripts/complete-order-after-payment.js <orderId>');
  process.exit(1);
}

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || JSON.stringify(data));
  return data;
}

async function main() {
  const user = await api('POST', '/auth/login', { body: USER });
  const admin = await api('POST', '/auth/admin/login', { body: ADMIN });

  const order = await api('GET', `/orders/my/${orderId}`, { token: user.accessToken });
  if (order.payment?.status !== 'PAID') {
    console.error('Order payment not PAID yet. Complete Razorpay checkout first.');
    process.exit(1);
  }
  console.log('Payment confirmed:', order.payment.razorpayPaymentId);

  for (const status of ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED']) {
    await api('PATCH', `/admin/orders/${orderId}/status`, { token: admin.accessToken, body: { status } });
    console.log('Order →', status);
  }

  const ret = await api('POST', `/orders/my/${orderId}/return`, {
    token: user.accessToken,
    body: { reason: 'E2E test return after real Razorpay payment.' },
  });
  console.log('Return requested:', ret.returnId);

  const list = await api('GET', '/admin/returns?limit=10', { token: admin.accessToken });
  const row = list.items.find((r) => r.orderId === orderId);
  if (!row) throw new Error('Return not found in admin');

  for (const status of ['APPROVED', 'RECEIVED', 'REFUNDED']) {
    const updated = await api('PATCH', `/admin/returns/${row.id}`, {
      token: admin.accessToken,
      body: { status },
    });
    console.log(`Return → ${status}:`, updated.message);
    if (updated.refund) console.log('  refund:', updated.refund);
  }

  console.log('\nDone. Check Razorpay dashboard (Test Mode, today) → Refunded');
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
