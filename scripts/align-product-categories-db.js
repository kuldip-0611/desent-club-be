/**
 * ProductCategory table + FK from Product.categoryId (idempotent).
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

async function fkExists(prisma, table, constraintName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    constraintName,
  );
  return Number(rows[0].c) > 0;
}

async function fkReferenceTable(prisma, table, constraintName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT REFERENCED_TABLE_NAME AS refTable
     FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
     LIMIT 1`,
    table,
    constraintName,
  );
  return rows[0]?.refTable ?? null;
}

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0].c) > 0;
}

async function indexExists(prisma, table, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName,
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
    if (!(await tableExists(prisma, 'ProductCategory'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`ProductCategory\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`slug\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`image\` VARCHAR(2048) NULL,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ProductCategory_slug_key\` (\`slug\`),
          KEY \`ProductCategory_isActive_idx\` (\`isActive\`)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create ProductCategory',
      );
    } else {
      console.log('SKIP: ProductCategory table');
    }

    if (await tableExists(prisma, 'ProductCategory')) {
      if (!(await columnExists(prisma, 'ProductCategory', 'image'))) {
        await run(
          'ALTER TABLE `ProductCategory` ADD COLUMN `image` VARCHAR(2048) NULL AFTER `name`',
          'add ProductCategory.image',
        );
      } else {
        console.log('SKIP: ProductCategory.image column');
      }

      if (await indexExists(prisma, 'ProductCategory', 'ProductCategory_sortOrder_idx')) {
        await run(
          'ALTER TABLE `ProductCategory` DROP INDEX `ProductCategory_sortOrder_idx`',
          'drop ProductCategory_sortOrder_idx',
        );
      } else {
        console.log('SKIP: ProductCategory_sortOrder_idx');
      }

      if (await columnExists(prisma, 'ProductCategory', 'sortOrder')) {
        await run(
          'ALTER TABLE `ProductCategory` DROP COLUMN `sortOrder`',
          'drop ProductCategory.sortOrder',
        );
      } else {
        console.log('SKIP: ProductCategory.sortOrder column');
      }
    }

    if (await tableExists(prisma, 'Product')) {
      const hasFk = await fkExists(prisma, 'Product', 'Product_categoryId_fkey');
      const refTable = hasFk
        ? await fkReferenceTable(prisma, 'Product', 'Product_categoryId_fkey')
        : null;
      const needsCreate = !hasFk;
      const needsRecreate =
        hasFk && String(refTable ?? '').toLowerCase() !== 'productcategory';

      if (needsRecreate) {
        await run(
          'ALTER TABLE `Product` DROP FOREIGN KEY `Product_categoryId_fkey`',
          'drop wrong Product.categoryId FK',
        );
      }

      if (needsCreate || needsRecreate) {
        await run(
          `UPDATE \`Product\` p
           LEFT JOIN \`ProductCategory\` c ON p.categoryId = c.id
           SET p.categoryId = NULL
           WHERE p.categoryId IS NOT NULL AND c.id IS NULL`,
          'clear orphan Product.categoryId values before FK',
        );
        await run(
          `
          ALTER TABLE \`Product\`
          ADD CONSTRAINT \`Product_categoryId_fkey\`
          FOREIGN KEY (\`categoryId\`) REFERENCES \`ProductCategory\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
          `,
          'Product.categoryId FK',
        );
      } else {
        console.log('SKIP: Product.categoryId FK');
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
