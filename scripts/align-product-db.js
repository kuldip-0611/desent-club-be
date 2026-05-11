/**
 * Aligns legacy Product / ProductImage tables with prisma/schema.prisma (admin catalog).
 * Idempotent: skips ALTER ADD when column already exists.
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
    await run(
      'ALTER TABLE `Product` MODIFY `description` TEXT NULL',
      'Product.description nullable TEXT',
    );
    await run(
      'ALTER TABLE `Product` MODIFY `categoryId` VARCHAR(191) NULL',
      'Product.categoryId nullable',
    );
    await run(
      'ALTER TABLE `Product` MODIFY `productTypeId` VARCHAR(191) NULL',
      'Product.productTypeId nullable',
    );
    await run(
      'UPDATE `Product` SET `color` = \'\' WHERE `color` IS NULL',
      'Product.color backfill null -> empty string',
    );
    await run(
      'UPDATE `Product` SET `fabric` = \'\' WHERE `fabric` IS NULL',
      'Product.fabric backfill null -> empty string',
    );
    await run(
      'ALTER TABLE `Product` MODIFY `color` VARCHAR(191) NOT NULL DEFAULT \'\'',
      'Product.color not null default empty string',
    );
    await run(
      'ALTER TABLE `Product` MODIFY `fabric` VARCHAR(191) NOT NULL DEFAULT \'\'',
      'Product.fabric not null default empty string',
    );

    if (!(await columnExists(prisma, 'Product', 'quantity'))) {
      await run(
        'ALTER TABLE `Product` ADD COLUMN `quantity` INT NOT NULL DEFAULT 0',
        'Product.quantity',
      );
    } else {
      console.log('SKIP: Product.quantity');
    }

    if (!(await columnExists(prisma, 'Product', 'isAvailable'))) {
      await run(
        'ALTER TABLE `Product` ADD COLUMN `isAvailable` TINYINT(1) NOT NULL DEFAULT 1',
        'Product.isAvailable',
      );
    } else {
      console.log('SKIP: Product.isAvailable');
    }

    if (!(await columnExists(prisma, 'ProductImage', 'sortOrder'))) {
      await run(
        'ALTER TABLE `ProductImage` ADD COLUMN `sortOrder` INT NOT NULL DEFAULT 0',
        'ProductImage.sortOrder',
      );
    } else {
      console.log('SKIP: ProductImage.sortOrder');
    }

    if (!(await columnExists(prisma, 'ProductImage', 'createdAt'))) {
      await run(
        'ALTER TABLE `ProductImage` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
        'ProductImage.createdAt',
      );
    } else {
      console.log('SKIP: ProductImage.createdAt');
    }

    if (!(await columnExists(prisma, 'ProductImage', 'color'))) {
      await run(
        'ALTER TABLE `ProductImage` ADD COLUMN `color` VARCHAR(191) NOT NULL DEFAULT \'\'',
        'ProductImage.color',
      );
    } else {
      console.log('SKIP: ProductImage.color');
    }

    if (!(await columnExists(prisma, 'Product', 'discountPercent'))) {
      await run(
        'ALTER TABLE `Product` ADD COLUMN `discountPercent` INT NULL',
        'Product.discountPercent',
      );
    } else {
      console.log('SKIP: Product.discountPercent');
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
