/**
 * ProductMeasurementAttribute join (product ↔ measurement attributes for size charts).
 */
const { PrismaClient } = require('@prisma/client');

async function tableExists(prisma, name) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    name,
  );
  return Number(rows[0].c) > 0;
}

async function main() {
  const prisma = new PrismaClient();
  const run = async (sql, label) => {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('OK:', label);
    } catch (e) {
      console.error('FAIL:', label, e.message);
      throw e;
    }
  };

  try {
    if (!(await tableExists(prisma, 'ProductMeasurementAttribute'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`ProductMeasurementAttribute\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`productId\` VARCHAR(191) NOT NULL,
          \`attributeId\` VARCHAR(191) NOT NULL,
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ProductMeasurementAttribute_productId_attributeId_key\` (\`productId\`, \`attributeId\`),
          KEY \`ProductMeasurementAttribute_productId_idx\` (\`productId\`),
          KEY \`ProductMeasurementAttribute_attributeId_idx\` (\`attributeId\`),
          CONSTRAINT \`ProductMeasurementAttribute_productId_fkey\` FOREIGN KEY (\`productId\`) REFERENCES \`Product\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT \`ProductMeasurementAttribute_attributeId_fkey\` FOREIGN KEY (\`attributeId\`) REFERENCES \`MeasurementAttribute\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create ProductMeasurementAttribute',
      );
    } else {
      console.log('SKIP: ProductMeasurementAttribute table');
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
