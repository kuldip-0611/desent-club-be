/**
 * ProductCategorySubcategory table + Product.subcategoryId (idempotent MySQL).
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
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
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
    if (!(await tableExists(prisma, 'ProductCategory'))) {
      console.log('SKIP: ProductCategory missing — run align-product-categories-db first');
      return;
    }

    if (!(await tableExists(prisma, 'ProductCategorySubcategory'))) {
      await run(
        `
        CREATE TABLE \`ProductCategorySubcategory\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`categoryId\` VARCHAR(191) NOT NULL,
          \`slug\` VARCHAR(191) NOT NULL,
          \`name\` VARCHAR(191) NOT NULL,
          \`image\` VARCHAR(191) NULL,
          \`sortOrder\` INT NOT NULL DEFAULT 0,
          \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`ProductCategorySubcategory_categoryId_slug_key\` (\`categoryId\`, \`slug\`),
          KEY \`ProductCategorySubcategory_categoryId_idx\` (\`categoryId\`),
          KEY \`ProductCategorySubcategory_isActive_idx\` (\`isActive\`),
          KEY \`ProductCategorySubcategory_sortOrder_idx\` (\`sortOrder\`),
          CONSTRAINT \`ProductCategorySubcategory_categoryId_fkey\`
            FOREIGN KEY (\`categoryId\`) REFERENCES \`ProductCategory\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create ProductCategorySubcategory',
      );
    } else {
      console.log('SKIP: ProductCategorySubcategory table');
    }

    if (await tableExists(prisma, 'ProductCategorySubcategory')) {
      if (!(await columnExists(prisma, 'ProductCategorySubcategory', 'image'))) {
        await run(
          'ALTER TABLE `ProductCategorySubcategory` ADD COLUMN `image` VARCHAR(191) NULL AFTER `name`',
          'add ProductCategorySubcategory.image',
        );
      } else {
        console.log('SKIP: ProductCategorySubcategory.image column');
      }
    }

    if (await tableExists(prisma, 'Product')) {
      if (!(await columnExists(prisma, 'Product', 'subcategoryId'))) {
        await run(
          'ALTER TABLE `Product` ADD COLUMN `subcategoryId` VARCHAR(191) NULL AFTER `categoryId`',
          'add Product.subcategoryId',
        );
      } else {
        console.log('SKIP: Product.subcategoryId column');
      }

      await run(
        `UPDATE \`Product\` p
         LEFT JOIN \`ProductCategorySubcategory\` s ON p.\`subcategoryId\` = s.\`id\`
         SET p.\`subcategoryId\` = NULL
         WHERE p.\`subcategoryId\` IS NOT NULL AND s.\`id\` IS NULL`,
        'clear orphan Product.subcategoryId',
      );

      if (!(await fkExists(prisma, 'Product', 'Product_subcategoryId_fkey'))) {
        await run(
          `
          ALTER TABLE \`Product\`
          ADD CONSTRAINT \`Product_subcategoryId_fkey\`
          FOREIGN KEY (\`subcategoryId\`) REFERENCES \`ProductCategorySubcategory\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
          `,
          'Product.subcategoryId FK',
        );
      } else {
        console.log('SKIP: Product.subcategoryId FK');
      }
    }

    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main();
