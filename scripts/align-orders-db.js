/**
 * Ensures order/return/payment columns exist (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`ReturnRequest\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`orderId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`reason\` TEXT NOT NULL,
        \`status\` ENUM('REQUESTED','APPROVED','REJECTED','RECEIVED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
        \`adminNote\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`ReturnRequest_orderId_idx\` (\`orderId\`),
        KEY \`ReturnRequest_userId_idx\` (\`userId\`),
        KEY \`ReturnRequest_status_idx\` (\`status\`),
        CONSTRAINT \`ReturnRequest_orderId_fkey\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`Order\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`ReturnRequest_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: ReturnRequest table ensured');

    if (!(await columnExists(prisma, 'Payment', 'method'))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`Payment\`
        ADD COLUMN \`method\` ENUM('ONLINE','COD') NOT NULL DEFAULT 'ONLINE' AFTER \`orderId\`
      `);
      console.log('OK: Payment.method added');
    }

    if (!(await columnExists(prisma, 'Payment', 'razorpayRefundId'))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`Payment\`
        ADD COLUMN \`razorpayRefundId\` VARCHAR(191) NULL AFTER \`razorpaySignature\`
      `);
      console.log('OK: Payment.razorpayRefundId added');
    }

    if (!(await columnExists(prisma, 'Payment', 'refundedAt'))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`Payment\`
        ADD COLUMN \`refundedAt\` DATETIME(3) NULL AFTER \`failureReason\`
      `);
      console.log('OK: Payment.refundedAt added');
    }

    console.log('Done. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
