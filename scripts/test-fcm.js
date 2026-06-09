/**
 * Quick FCM test script.
 * Usage:
 *   node scripts/test-fcm.js <fcm-registration-token>
 *
 * If no token is given, it tests Firebase Admin init only.
 */
require('dotenv').config()
const admin = require('firebase-admin')

const projectId   = process.env.FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const rawKey      = process.env.FIREBASE_PRIVATE_KEY

if (!projectId || !clientEmail || !rawKey) {
  console.error('❌  Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in .env')
  process.exit(1)
}

const privateKey = rawKey.replace(/\\n/g, '\n')

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
})

console.log('✅  Firebase Admin initialised successfully')
console.log(`    Project : ${projectId}`)
console.log(`    Account : ${clientEmail}`)

const targetToken = process.argv[2]

if (!targetToken) {
  console.log('\nℹ️  No FCM token provided — skipping send test.')
  console.log('   Run again with a token to test sending:')
  console.log('   node scripts/test-fcm.js <fcm-registration-token>\n')
  process.exit(0)
}

;(async () => {
  try {
    const messageId = await admin.messaging().send({
      token: targetToken,
      notification: {
        title: '🔔 Desent Club Test',
        body: 'Firebase push notification is working!',
      },
      webpush: {
        notification: {
          title: '🔔 Desent Club Test',
          body: 'Firebase push notification is working!',
          icon: '/icon.png',
        },
      },
    })
    console.log(`\n✅  Push sent! Message ID: ${messageId}\n`)
  } catch (err) {
    console.error('\n❌  Push send failed:', err.message)
    process.exit(1)
  }
})()
