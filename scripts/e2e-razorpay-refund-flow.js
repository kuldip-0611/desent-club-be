/**
 * End-to-end: create order → Razorpay test payment → deliver → return → refund.
 * Usage: node scripts/e2e-razorpay-refund-flow.js
 */
const { createHmac } = require('crypto');
const { PrismaClient } = require('@prisma/client');
const Razorpay = require('razorpay');
require('dotenv').config();

const API = process.env.API_URL || 'http://localhost:3001';
const USER_EMAIL = process.env.E2E_USER_EMAIL || 'newuser06@yopmail.com';
const USER_PASSWORD = process.env.E2E_USER_PASSWORD || 'Kuldip@0611';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Kuldip@0611';

const prisma = new PrismaClient();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
  if (!res.ok) {
    throw new Error(data.message || `${method} ${path} failed (${res.status})`);
  }
  return data;
}

function signPayment(orderId, paymentId, secret) {
  return createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

async function pickProduct() {
  const product = await prisma.product.findFirst({
    where: { isAvailable: true, name: { contains: 'Logo Essential' } },
    include: { variants: { take: 1 } },
  });
  if (product?.variants[0]) return product;

  return prisma.product.findFirst({
    where: { isAvailable: true },
    include: { variants: { take: 1 } },
  });
}

async function createRazorpayTestPayment(razorpayOrderId, amountPaise) {
  // Razorpay test mode: create payment against order using their test payment API
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

  const res = await fetch('https://api.razorpay.com/v1/payments/create/test', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      order_id: razorpayOrderId,
      method: 'card',
      card: {
        number: '4111111111111111',
        cvv: '100',
        expiry_month: '12',
        expiry_year: '2030',
        name: 'Test User',
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Razorpay test payment failed: ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('=== E2E Razorpay order + refund flow ===\n');

  const userLogin = await api('POST', '/auth/login', {
    body: { email: USER_EMAIL, password: USER_PASSWORD },
  });
  const userToken = userLogin.accessToken;
  console.log('User logged in:', USER_EMAIL);

  const adminLogin = await api('POST', '/auth/admin/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  const adminToken = adminLogin.accessToken;
  console.log('Admin logged in:', ADMIN_EMAIL);

  const product = await pickProduct();
  if (!product?.variants[0]) throw new Error('No product with variant found');
  const variant = product.variants[0];

  const address = await prisma.userAddress.findFirst({
    where: { user: { email: USER_EMAIL }, isDefault: true },
  });
  if (!address) throw new Error('No default address for test user');

  const orderResp = await api('POST', '/orders', {
    token: userToken,
    body: {
      items: [
        {
          productId: product.id,
          variantId: variant.id,
          size: variant.size,
          color: variant.color,
          quantity: 1,
        },
      ],
      addressId: address.id,
    },
  });

  console.log('\nOrder created:', orderResp.orderId);
  console.log('Razorpay order:', orderResp.razorpayOrderId);
  console.log('Amount (paise):', orderResp.amount);

  let paymentId;
  try {
    const payment = await createRazorpayTestPayment(orderResp.razorpayOrderId, orderResp.amount);
    paymentId = payment.razorpay_payment_id || payment.id;
    console.log('Razorpay test payment:', paymentId);
  } catch (err) {
    console.error('\nTest payment API failed:', err.message);
    console.log('\nFallback: open this URL in browser to pay manually, then re-run with PAYMENT_ID env:');
    console.log(
      `http://localhost:3000/checkout  (login as ${USER_EMAIL}, complete payment for order ${orderResp.orderId})`,
    );
    if (!process.env.RAZORPAY_PAYMENT_ID) process.exit(1);
    paymentId = process.env.RAZORPAY_PAYMENT_ID;
  }

  const signature = signPayment(
    orderResp.razorpayOrderId,
    paymentId,
    process.env.RAZORPAY_KEY_SECRET,
  );

  const verified = await api('POST', '/orders/verify-payment', {
    body: {
      razorpayOrderId: orderResp.razorpayOrderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    },
  });
  console.log('Payment verified:', verified.message);

  await api('PATCH', `/admin/orders/${orderResp.orderId}/status`, {
    token: adminToken,
    body: { status: 'CONFIRMED' },
  });
  await api('PATCH', `/admin/orders/${orderResp.orderId}/status`, {
    token: adminToken,
    body: { status: 'PROCESSING' },
  });
  await api('PATCH', `/admin/orders/${orderResp.orderId}/status`, {
    token: adminToken,
    body: { status: 'SHIPPED' },
  });
  await api('PATCH', `/admin/orders/${orderResp.orderId}/status`, {
    token: adminToken,
    body: { status: 'DELIVERED' },
  });
  console.log('Order marked DELIVERED');

  const returnResp = await api('POST', `/orders/my/${orderResp.orderId}/return`, {
    token: userToken,
    body: { reason: 'E2E test return — product not as expected for sizing.' },
  });
  console.log('Return requested:', returnResp.returnId);

  const returns = await api('GET', '/admin/returns?limit=5', { token: adminToken });
  const returnRow = returns.items.find((r) => r.orderId === orderResp.orderId);
  if (!returnRow) throw new Error('Return not visible in admin');

  for (const status of ['APPROVED', 'RECEIVED', 'REFUNDED']) {
    const updated = await api('PATCH', `/admin/returns/${returnRow.id}`, {
      token: adminToken,
      body: { status },
    });
    console.log(`Return → ${status}:`, updated.message);
    if (updated.refund) console.log('  refund:', updated.refund);
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId: orderResp.orderId },
  });

  console.log('\n=== Done ===');
  console.log('Order ID:      ', orderResp.orderId);
  console.log('Razorpay order:', orderResp.razorpayOrderId);
  console.log('Razorpay pay:  ', payment?.razorpayPaymentId);
  console.log('Razorpay refund:', payment?.razorpayRefundId);
  console.log('Payment status:', payment?.status);
  console.log('\nCheck Razorpay dashboard (Test Mode, today) → Payments → Refunded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
