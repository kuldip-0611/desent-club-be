/**
 * Adds audience / color / fabric on Product and ensures ProductVariant matches Prisma (idempotent).
 * Handles legacy/partial ProductVariant tables missing columns like `quantity`.
 */
const { PrismaClient } = require('@prisma/client');

async function columnExists(prisma, table, column) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND COLUMN_NAME = ?`,
    table,
    column,
  );
  return Number(rows[0].c) > 0;
}

async function tableExists(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?)`,
    table,
  );
  return Number(rows[0].c) > 0;
}

async function indexColumns(prisma, table, indexName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = LOWER(?) AND INDEX_NAME = ?
     ORDER BY SEQ_IN_INDEX`,
    table,
    indexName,
  );
  return rows.map((r) => String(r.COLUMN_NAME || ''));
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
    if (!(await columnExists(prisma, 'Product', 'audience'))) {
      await run(
        `ALTER TABLE \`Product\` ADD COLUMN \`audience\` ENUM('MEN','WOMEN','UNISEX') NOT NULL DEFAULT 'UNISEX'`,
        'Product.audience',
      );
    } else {
      console.log('SKIP: Product.audience');
    }

    if (!(await columnExists(prisma, 'Product', 'color'))) {
      await run(
        'ALTER TABLE `Product` ADD COLUMN `color` VARCHAR(191) NULL',
        'Product.color',
      );
    } else {
      console.log('SKIP: Product.color');
    }
    await run(
      'ALTER TABLE `Product` MODIFY `color` VARCHAR(191) NULL',
      'Product.color nullable',
    );

    if (!(await columnExists(prisma, 'Product', 'fabric'))) {
      await run(
        'ALTER TABLE `Product` ADD COLUMN `fabric` VARCHAR(191) NULL',
        'Product.fabric',
      );
    } else {
      console.log('SKIP: Product.fabric');
    }
    await run(
      'ALTER TABLE `Product` MODIFY `fabric` VARCHAR(191) NULL',
      'Product.fabric nullable',
    );

    if (!(await tableExists(prisma, 'ProductVariant'))) {
      await run(
        `
        CREATE TABLE IF NOT EXISTS \`ProductVariant\` (
          \`id\` VARCHAR(191) NOT NULL,
          \`productId\` VARCHAR(191) NOT NULL,
          \`size\` VARCHAR(32) NOT NULL,
          \`quantity\` INT NOT NULL DEFAULT 0,
          \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`ProductVariant_productId_size_key\` (\`productId\`, \`size\`),
          INDEX \`ProductVariant_productId_idx\` (\`productId\`),
          CONSTRAINT \`ProductVariant_productId_fkey\` FOREIGN KEY (\`productId\`) REFERENCES \`Product\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        `,
        'create ProductVariant',
      );
    } else {
      const t = 'ProductVariant';
      if (!(await columnExists(prisma, t, 'quantity'))) {
        await run(
          'ALTER TABLE `ProductVariant` ADD COLUMN `quantity` INT NOT NULL DEFAULT 0',
          'ProductVariant.quantity',
        );
      } else {
        console.log('SKIP: ProductVariant.quantity');
      }
      if (!(await columnExists(prisma, t, 'size'))) {
        await run(
          `ALTER TABLE \`ProductVariant\` ADD COLUMN \`size\` VARCHAR(32) NOT NULL DEFAULT 'OS'`,
          'ProductVariant.size',
        );
      } else {
        console.log('SKIP: ProductVariant.size');
      }
      if (!(await columnExists(prisma, t, 'color'))) {
        await run(
          "ALTER TABLE `ProductVariant` ADD COLUMN `color` VARCHAR(191) NOT NULL DEFAULT ''",
          'ProductVariant.color',
        );
      } else {
        console.log('SKIP: ProductVariant.color');
      }
      if (!(await columnExists(prisma, t, 'createdAt'))) {
        await run(
          'ALTER TABLE `ProductVariant` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)',
          'ProductVariant.createdAt',
        );
      } else {
        console.log('SKIP: ProductVariant.createdAt');
      }
      if (!(await columnExists(prisma, t, 'updatedAt'))) {
        await run(
          'ALTER TABLE `ProductVariant` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)',
          'ProductVariant.updatedAt',
        );
      } else {
        console.log('SKIP: ProductVariant.updatedAt');
      }

      const variantUniqueIndex = 'ProductVariant_productId_size_key';
      const cols = await indexColumns(prisma, t, variantUniqueIndex);
      const hasExpectedUnique = cols.join(',') === 'productId,size,color';
      if (!hasExpectedUnique) {
        if (cols.length > 0) {
          await run(
            `ALTER TABLE \`ProductVariant\` DROP INDEX \`${variantUniqueIndex}\``,
            'ProductVariant unique(productId,size) drop',
          );
        }
        await run(
          'ALTER TABLE `ProductVariant` ADD UNIQUE INDEX `ProductVariant_productId_size_key` (`productId`, `size`, `color`)',
          'ProductVariant unique(productId,size,color)',
        );
      } else {
        console.log('SKIP: ProductVariant unique(productId,size,color)');
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
