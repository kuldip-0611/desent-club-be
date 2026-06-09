/**
 * Runs all idempotent DB alignment scripts (legacy Product + Coupon + variants).
 * Run after pulling schema changes: `npm run db:align-all` or `yarn db:align-all`
 */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const run = (rel) => {
  console.log(`\n>>> ${rel}\n`);
  execSync(`node ${path.join('scripts', rel)}`, { cwd: root, stdio: 'inherit' });
};

try {
  run('align-product-db.js');
  run('align-product-categories-db.js');
  run('align-product-subcategories-db.js');
  run('align-fabric-db.js');
  run('align-user-db.js');
  run('align-coupon-db.js');
  run('align-user-groups-coupons-db.js');
  run('align-password-reset-db.js');
  run('align-user-addresses-db.js');
  run('align-product-variants-db.js');
  run('align-sizing-catalog-db.js');
  run('align-product-measurement-attributes-db.js');
  run('align-orders-db.js');
  console.log('\n>>> All alignment scripts finished.\n');
} catch (e) {
  console.error(e);
  process.exit(1);
}
