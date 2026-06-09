/**
 * Ensures PasswordResetToken table exists (idempotent).
 */
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`PasswordResetToken\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`tokenHash\` VARCHAR(64) NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`usedAt\` DATETIME(3) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`PasswordResetToken_tokenHash_key\` (\`tokenHash\`),
        KEY \`PasswordResetToken_userId_idx\` (\`userId\`),
        KEY \`PasswordResetToken_expiresAt_idx\` (\`expiresAt\`),
        CONSTRAINT \`PasswordResetToken_userId_fkey\`
          FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log('OK: PasswordResetToken table ensured');
    console.log('Done. Run: npx prisma generate');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
