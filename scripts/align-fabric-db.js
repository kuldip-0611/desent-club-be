/**
 * Fabric catalog + ProductFabric join + migrate legacy Product.fabricId / fabricPercent (idempotent).
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

async function fkExists(prisma, table, constraintName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    constraintName,
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
    if (!(await tableExists(prisma, 'Fabric'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`Fabric\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`slug\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`Fabric_slug_key\` (\`slug\`),
          KEY \`Fabric_isActive_idx\` (\`isActive\`),
          KEY \`Fabric_sortOrder_idx\` (\`sortOrder\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create Fabric',
      );
    } else {
      console.log('SKIP: Fabric table');
    }

    if (!(await tableExists(prisma, 'ProductFabric'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`ProductFabric\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`productId\` VARCHAR(191) NOT NULL,
          \`fabricId\` VARCHAR(191) NOT NULL,
          \`percent\` INT NOT NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ProductFabric_productId_fabricId_key\` (\`productId\`, \`fabricId\`),
          KEY \`ProductFabric_productId_idx\` (\`productId\`),
          KEY \`ProductFabric_fabricId_idx\` (\`fabricId\`),
          CONSTRAINT \`ProductFabric_productId_fkey\` FOREIGN KEY (\`productId\`) REFERENCES \`Product\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT \`ProductFabric_fabricId_fkey\` FOREIGN KEY (\`fabricId\`) REFERENCES \`Fabric\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create ProductFabric',
      );
    } else {
      console.log('SKIP: ProductFabric table');
    }

    if (
      (await tableExists(prisma, 'Product')) &&
      (await columnExists(prisma, 'Product', 'fabricId')) &&
      (await tableExists(prisma, 'ProductFabric'))
    ) {
      await run(
        `
        INSERT INTO \`ProductFabric\` (\`id\`, \`productId\`, \`fabricId\`, \`percent\`)
        SELECT UUID(), p.\`id\`, p.\`fabricId\`, p.\`fabricPercent\`
        FROM \`Product\` p
        LEFT JOIN \`Fabric\` f ON p.\`fabricId\` = f.\`id\`
        WHERE p.\`fabricId\` IS NOT NULL
          AND p.\`fabricPercent\` IS NOT NULL
          AND f.\`id\` IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM \`ProductFabric\` pf WHERE pf.\`productId\` = p.\`id\`
          )
        `,
        'migrate legacy Product.fabricId into ProductFabric',
      );
    } else {
      console.log('SKIP: migrate legacy fabric columns');
    }

    if ((await fkExists(prisma, 'Product', 'Product_fabricId_fkey'))) {
      await run(
        'ALTER TABLE `Product` DROP FOREIGN KEY `Product_fabricId_fkey`',
        'drop Product_fabricId_fkey',
      );
    } else {
      console.log('SKIP: drop Product_fabricId_fkey');
    }

    if ((await columnExists(prisma, 'Product', 'fabricId'))) {
      await run('ALTER TABLE `Product` DROP COLUMN `fabricId`', 'drop Product.fabricId');
    } else {
      console.log('SKIP: drop Product.fabricId');
    }

    if ((await columnExists(prisma, 'Product', 'fabricPercent'))) {
      await run('ALTER TABLE `Product` DROP COLUMN `fabricPercent`', 'drop Product.fabricPercent');
    } else {
      console.log('SKIP: drop Product.fabricPercent');
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
