/**
 * Tests the Razorpay refund API with test credentials.
 *
 * Usage:
 *   node scripts/test-refund.js <razorpay_payment_id>
 *
 * Where <razorpay_payment_id> is a real captured payment ID from the
 * Razorpay Test Dashboard (looks like  pay_XXXXXXXXXXXXXXXXXX).
 *
 * With test keys, Razorpay simulates refunds instantly and you can
 * see them under: Dashboard → Payments → (select payment) → Refunds
 */
require('dotenv').config()
const Razorpay = require('razorpay')

const keyId     = process.env.RAZORPAY_KEY_ID
const keySecret = process.env.RAZORPAY_KEY_SECRET

if (!keyId || !keySecret) {
  console.error('❌  Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in .env')
  process.exit(1)
}

const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret })

const paymentId = process.argv[2]

if (!paymentId) {
  console.log('\nUsage:  node scripts/test-refund.js <razorpay_payment_id>')
  console.log('\nGet a captured payment ID from:')
  console.log('  https://dashboard.razorpay.com/app/payments (Test mode)\n')
  process.exit(0)
}

;(async () => {
  console.log(`\nFetching payment ${paymentId} …`)

  let payment
  try {
    payment = await razorpay.payments.fetch(paymentId)
  } catch (e) {
    console.error('❌  Could not fetch payment:', e.error?.description ?? e.message)
    process.exit(1)
  }

  console.log(`  Status  : ${payment.status}`)
  console.log(`  Amount  : ₹${(payment.amount / 100).toFixed(2)}`)
  console.log(`  Captured: ${payment.captured}`)

  if (payment.status !== 'captured') {
    console.error(`\n❌  Payment is "${payment.status}" — only captured payments can be refunded.`)
    process.exit(1)
  }

  console.log('\nInitiating full refund …')

  try {
    const refund = await razorpay.payments.refund(paymentId, {
      amount: payment.amount,
      speed: 'normal',
      notes: { reason: 'Order cancelled by customer — test refund' },
    })

    console.log('\n✅  Refund initiated successfully!')
    console.log(`  Refund ID : ${refund.id}`)
    console.log(`  Amount    : ₹${(refund.amount / 100).toFixed(2)}`)
    console.log(`  Status    : ${refund.status}`)
    console.log(`  Speed     : ${refund.speed_processed ?? refund.speed_requested}`)
    console.log('\nCheck it in the Razorpay dashboard:')
    console.log(`  https://dashboard.razorpay.com/app/payments/${paymentId}\n`)
  } catch (e) {
    console.error('\n❌  Refund failed:', e.error?.description ?? e.message)
    process.exit(1)
  }
})()
