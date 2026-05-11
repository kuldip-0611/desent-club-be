/**
 * Ensures `Coupon` + `CouponCategory` exist (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`Coupon\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(191) NOT NULL,
        \`discountType\` ENUM('PERCENT', 'FIXED') NOT NULL,
        \`value\` DECIMAL(10, 2) NOT NULL,
        \`minSubtotal\` DECIMAL(10, 2) NULL,
        \`maxDiscount\` DECIMAL(10, 2) NULL,
        \`usageLimit\` INT NULL,
        \`usedCount\` INT NOT NULL DEFAULT 0,
        \`startsAt\` DATETIME(3) NULL,
        \`endsAt\` DATETIME(3) NULL,
        \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`Coupon_code_key\` (\`code\`),
        KEY \`Coupon_isActive_idx\` (\`isActive\`),
        KEY \`Coupon_endsAt_idx\` (\`endsAt\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: Coupon table ensured (CREATE IF NOT EXISTS)');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`CouponCategory\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`couponId\` VARCHAR(191) NOT NULL,
        \`categoryId\` VARCHAR(191) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`CouponCategory_couponId_categoryId_key\` (\`couponId\`, \`categoryId\`),
        KEY \`CouponCategory_couponId_idx\` (\`couponId\`),
        KEY \`CouponCategory_categoryId_idx\` (\`categoryId\`),
        CONSTRAINT \`CouponCategory_couponId_fkey\`
          FOREIGN KEY (\`couponId\`) REFERENCES \`Coupon\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`CouponCategory_categoryId_fkey\`
          FOREIGN KEY (\`categoryId\`) REFERENCES \`ProductCategory\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: CouponCategory table ensured (CREATE IF NOT EXISTS)');
    console.log('Done. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
