/**
 * Sizing catalog: MeasurementAttribute, Size, SizeMeasurementValue + ProductVariant.sizeId
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

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND COLUMN_NAME = ?`,
    table,
    column,
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
    if (!(await tableExists(prisma, 'MeasurementAttribute'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`MeasurementAttribute\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`slug\` VARCHAR(191) NOT NULL,
          \`label\` VARCHAR(191) NOT NULL,
          \`unit\` VARCHAR(191) NULL,
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`MeasurementAttribute_slug_key\` (\`slug\`),
          KEY \`MeasurementAttribute_isActive_idx\` (\`isActive\`),
          KEY \`MeasurementAttribute_sortOrder_idx\` (\`sortOrder\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create MeasurementAttribute',
      );
    } else {
      console.log('SKIP: MeasurementAttribute table');
    }

    if (!(await tableExists(prisma, 'Size'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`Size\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`code\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NULL,
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`Size_code_key\` (\`code\`),
          KEY \`Size_isActive_idx\` (\`isActive\`),
          KEY \`Size_sortOrder_idx\` (\`sortOrder\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create Size',
      );
    } else {
      console.log('SKIP: Size table');
    }

    if (await tableExists(prisma, 'Size')) {
      if (!(await columnExists(prisma, 'Size', 'valueUnit'))) {
        await run(
          'ALTER TABLE `Size` ADD COLUMN `valueUnit` VARCHAR(4) NULL',
          'Size.valueUnit',
        );
      } else {
        console.log('SKIP: Size.valueUnit');
      }
    }

    if (!(await tableExists(prisma, 'SizeMeasurementValue'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`SizeMeasurementValue\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`sizeId\` VARCHAR(191) NOT NULL,
          \`attributeId\` VARCHAR(191) NOT NULL,
          \`value\` VARCHAR(64) NOT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`SizeMeasurementValue_sizeId_attributeId_key\` (\`sizeId\`, \`attributeId\`),
          KEY \`SizeMeasurementValue_sizeId_idx\` (\`sizeId\`),
          KEY \`SizeMeasurementValue_attributeId_idx\` (\`attributeId\`),
          CONSTRAINT \`SizeMeasurementValue_sizeId_fkey\` FOREIGN KEY (\`sizeId\`) REFERENCES \`Size\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT \`SizeMeasurementValue_attributeId_fkey\` FOREIGN KEY (\`attributeId\`) REFERENCES \`MeasurementAttribute\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create SizeMeasurementValue',
      );
    } else {
      console.log('SKIP: SizeMeasurementValue table');
    }

    if (await tableExists(prisma, 'ProductVariant')) {
      if (!(await columnExists(prisma, 'ProductVariant', 'sizeId'))) {
        await run(
          'ALTER TABLE `ProductVariant` ADD COLUMN `sizeId` VARCHAR(191) NULL',
          'ProductVariant.sizeId',
        );
        await run(
          'CREATE INDEX `ProductVariant_sizeId_idx` ON `ProductVariant`(`sizeId`)',
          'ProductVariant_sizeId_idx',
        );
        await run(
          `
          ALTER TABLE \`ProductVariant\`
          ADD CONSTRAINT \`ProductVariant_sizeId_fkey\`
          FOREIGN KEY (\`sizeId\`) REFERENCES \`Size\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
          `,
          'ProductVariant_sizeId_fkey',
        );
      } else {
        console.log('SKIP: ProductVariant.sizeId');
      }
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
