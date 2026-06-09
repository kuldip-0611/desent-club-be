/**
 * Ensures UserAddress table exists (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`UserAddress\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`label\` VARCHAR(191) NULL,
        \`fullName\` VARCHAR(191) NOT NULL,
        \`phone\` VARCHAR(191) NOT NULL,
        \`line1\` VARCHAR(191) NOT NULL,
        \`line2\` VARCHAR(191) NULL,
        \`city\` VARCHAR(191) NOT NULL,
        \`state\` VARCHAR(191) NOT NULL,
        \`pincode\` VARCHAR(191) NOT NULL,
        \`country\` VARCHAR(191) NOT NULL DEFAULT 'India',
        \`isDefault\` BOOLEAN NOT NULL DEFAULT false,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`UserAddress_userId_idx\` (\`userId\`),
        KEY \`UserAddress_userId_isDefault_idx\` (\`userId\`, \`isDefault\`),
        CONSTRAINT \`UserAddress_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: UserAddress table ensured');
    console.log('Done. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
