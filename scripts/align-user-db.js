/**
 * Ensures User.profileImage column exists (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0].c) > 0;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    if (!(await columnExists(prisma, 'User', 'profileImage'))) {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE `User` ADD COLUMN `profileImage` VARCHAR(191) NULL AFTER `phone`',
      );
      console.log('OK: User.profileImage column added');
    } else {
      console.log('SKIP: User.profileImage already exists');
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
