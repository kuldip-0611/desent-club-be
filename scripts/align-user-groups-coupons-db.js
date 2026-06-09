/**
 * Ensures user groups, coupon-user assignments, and redemption tables exist (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function ensureColumn(prisma, table, column, definition) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  const count = Number(rows[0]?.c ?? 0);
  if (count === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
    );
    console.log(`OK: ${table}.${column} added`);
  } else {
    console.log(`SKIP: ${table}.${column} already exists`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureColumn(prisma, 'Coupon', 'perUserLimit', 'INT NULL');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`UserGroup\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(191) NOT NULL,
        \`description\` TEXT NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`UserGroup_isActive_idx\` (\`isActive\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: UserGroup table ensured');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`UserGroupMember\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`userGroupId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UserGroupMember_userGroupId_userId_key\` (\`userGroupId\`, \`userId\`),
        KEY \`UserGroupMember_userId_idx\` (\`userId\`),
        CONSTRAINT \`UserGroupMember_userGroupId_fkey\`
          FOREIGN KEY (\`userGroupId\`) REFERENCES \`UserGroup\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`UserGroupMember_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: UserGroupMember table ensured');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CouponUser\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`couponId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`CouponUser_couponId_userId_key\` (\`couponId\`, \`userId\`),
        KEY \`CouponUser_userId_idx\` (\`userId\`),
        CONSTRAINT \`CouponUser_couponId_fkey\`
          FOREIGN KEY (\`couponId\`) REFERENCES \`Coupon\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`CouponUser_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: CouponUser table ensured');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CouponUserGroup\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`couponId\` VARCHAR(191) NOT NULL,
        \`userGroupId\` VARCHAR(191) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`CouponUserGroup_couponId_userGroupId_key\` (\`couponId\`, \`userGroupId\`),
        KEY \`CouponUserGroup_userGroupId_idx\` (\`userGroupId\`),
        CONSTRAINT \`CouponUserGroup_couponId_fkey\`
          FOREIGN KEY (\`couponId\`) REFERENCES \`Coupon\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`CouponUserGroup_userGroupId_fkey\`
          FOREIGN KEY (\`userGroupId\`) REFERENCES \`UserGroup\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: CouponUserGroup table ensured');

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CouponRedemption\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`couponId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`redeemedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`CouponRedemption_couponId_userId_idx\` (\`couponId\`, \`userId\`),
        KEY \`CouponRedemption_userId_idx\` (\`userId\`),
        CONSTRAINT \`CouponRedemption_couponId_fkey\`
          FOREIGN KEY (\`couponId\`) REFERENCES \`Coupon\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`CouponRedemption_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: CouponRedemption table ensured');
    console.log('Done. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
