/**
 * Comprehensive seed — 5 categories, 25 subcategories, ~250 products with images.
 * Run: npx ts-node -r tsconfig-paths/register prisma/seed.ts
 */
import { PrismaClient, ProductAudience, CouponDiscountType } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

// ── Image pools by category (Unsplash, all free) ─────────────────────────────

const IMG = {
  tshirt: [
    'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80',
    'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?w=800&q=80',
    'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&q=80',
    'https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=800&q=80',
    'https://images.unsplash.com/photo-1562157873-818bc0726f68?w=800&q=80',
    'https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=800&q=80',
    'https://images.unsplash.com/photo-1527719327859-a9f27e1b30bf?w=800&q=80',
    'https://images.unsplash.com/photo-1529374255404-311a2a4f1fd9?w=800&q=80',
    'https://images.unsplash.com/photo-1622445275576-721325763afe?w=800&q=80',
    'https://images.unsplash.com/photo-1614676471928-2ed0ad1061a4?w=800&q=80',
    'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=800&q=80',
    'https://images.unsplash.com/photo-1503342394128-c104d54dba01?w=800&q=80',
    'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&q=80',
    'https://images.unsplash.com/photo-1605518216938-7c31b7b14ad0?w=800&q=80',
    'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=800&q=80',
    'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=800&q=80',
    'https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=800&q=80',
    'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&q=80',
  ],
  hoodie: [
    'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=800&q=80',
    'https://images.unsplash.com/photo-1542327897-d73f4005b533?w=800&q=80',
    'https://images.unsplash.com/photo-1509942774463-acf339cf87d5?w=800&q=80',
    'https://images.unsplash.com/photo-1620799139507-2a76f79a2f4d?w=800&q=80',
    'https://images.unsplash.com/photo-1578681994506-b8f463449011?w=800&q=80',
    'https://images.unsplash.com/photo-1604644401890-0bd678c83788?w=800&q=80',
    'https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=800&q=80',
    'https://images.unsplash.com/photo-1614495591838-d0c64db98a59?w=800&q=80',
    'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&q=80',
    'https://images.unsplash.com/photo-1631541909061-71e349d1f016?w=800&q=80',
    'https://images.unsplash.com/photo-1565693413579-8ff3fdc1b03b?w=800&q=80',
    'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=800&q=80',
  ],
  bottoms: [
    'https://images.unsplash.com/photo-1591195853828-11db59a44f43?w=800&q=80',
    'https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=800&q=80',
    'https://images.unsplash.com/photo-1519058082700-08a0b56da9b4?w=800&q=80',
    'https://images.unsplash.com/photo-1542272604-787c3835535d?w=800&q=80',
    'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=800&q=80',
    'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=800&q=80',
    'https://images.unsplash.com/photo-1604176354204-9268737828e4?w=800&q=80',
    'https://images.unsplash.com/photo-1551854838-212c50b4c184?w=800&q=80',
    'https://images.unsplash.com/photo-1547949003-9792a18a2601?w=800&q=80',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
    'https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=800&q=80',
    'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?w=800&q=80',
  ],
  shorts: [
    'https://images.unsplash.com/photo-1591195854069-a09baf7fd5c2?w=800&q=80',
    'https://images.unsplash.com/photo-1560243563-062bfc001d68?w=800&q=80',
    'https://images.unsplash.com/photo-1504975280405-e7e7a1e6d7f9?w=800&q=80',
    'https://images.unsplash.com/photo-1538330626427-0d9b4575b58e?w=800&q=80',
    'https://images.unsplash.com/photo-1564859228273-274232fdb516?w=800&q=80',
    'https://images.unsplash.com/photo-1565084888279-aca607ecce0c?w=800&q=80',
    'https://images.unsplash.com/photo-1583744946564-b52d01a7b321?w=800&q=80',
    'https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=800&q=80',
    'https://images.unsplash.com/photo-1571945153237-4929e783af4a?w=800&q=80',
  ],
  jacket: [
    'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=800&q=80',
    'https://images.unsplash.com/photo-1548126032-079a0fb0099d?w=800&q=80',
    'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&q=80',
    'https://images.unsplash.com/photo-1607345366928-199ea26cfe3e?w=800&q=80',
    'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=800&q=80',
    'https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800&q=80',
    'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=800&q=80',
    'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?w=800&q=80',
    'https://images.unsplash.com/photo-1611312449408-fcece27cdbb7?w=800&q=80',
    'https://images.unsplash.com/photo-1578932750294-f5075e85f44a?w=800&q=80',
    'https://images.unsplash.com/photo-1548369937-47519962c11a?w=800&q=80',
    'https://images.unsplash.com/photo-1542060748-10c28b62716f?w=800&q=80',
  ],
}

function pick<T>(arr: T[], index: number): T {
  return arr[index % arr.length]
}

function pickTwo<T>(arr: T[], index: number): [T, T] {
  return [arr[index % arr.length], arr[(index + 1) % arr.length]]
}

// Slug-safe string
function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function main() {
  console.log('🌱  Seeding database (full)...')

  // ── Admin & Demo users ───────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@123', 10)
  await prisma.user.upsert({
    where: { email: 'admin@disentclub.com' },
    update: {},
    create: { name: 'Admin', email: 'admin@disentclub.com', password: adminHash, role: 'ADMIN', isVerified: true, provider: 'EMAIL' },
  })
  const demoHash = await bcrypt.hash('Demo@123', 10)
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@disentclub.com' },
    update: {},
    create: { name: 'Demo User', email: 'demo@disentclub.com', password: demoHash, role: 'USER', isVerified: true, provider: 'EMAIL' },
  })
  console.log('✅  Users')

  // ── Fabrics ──────────────────────────────────────────────────────────────────
  const fabricRows = [
    { slug: 'cotton', name: 'Cotton', sortOrder: 1 },
    { slug: 'polyester', name: 'Polyester', sortOrder: 2 },
    { slug: 'linen', name: 'Linen', sortOrder: 3 },
    { slug: 'fleece', name: 'Fleece', sortOrder: 4 },
    { slug: 'nylon', name: 'Nylon', sortOrder: 5 },
    { slug: 'spandex', name: 'Spandex Blend', sortOrder: 6 },
    { slug: 'denim', name: 'Denim', sortOrder: 7 },
    { slug: 'wool-blend', name: 'Wool Blend', sortOrder: 8 },
  ]
  const fabrics: Record<string, string> = {}
  for (const f of fabricRows) {
    const r = await prisma.fabric.upsert({ where: { slug: f.slug }, update: {}, create: f })
    fabrics[f.slug] = r.id
  }
  console.log('✅  Fabrics')

  // ── Sizes ────────────────────────────────────────────────────────────────────
  const sizeRows = [
    { code: 'XS', name: 'Extra Small', sortOrder: 1 },
    { code: 'S', name: 'Small', sortOrder: 2 },
    { code: 'M', name: 'Medium', sortOrder: 3 },
    { code: 'L', name: 'Large', sortOrder: 4 },
    { code: 'XL', name: 'Extra Large', sortOrder: 5 },
    { code: 'XXL', name: 'Double XL', sortOrder: 6 },
    { code: '3XL', name: 'Triple XL', sortOrder: 7 },
    { code: '28', name: 'W28', sortOrder: 8 },
    { code: '30', name: 'W30', sortOrder: 9 },
    { code: '32', name: 'W32', sortOrder: 10 },
    { code: '34', name: 'W34', sortOrder: 11 },
    { code: '36', name: 'W36', sortOrder: 12 },
    { code: '38', name: 'W38', sortOrder: 13 },
  ]
  const sizes: Record<string, string> = {}
  for (const s of sizeRows) {
    const r = await prisma.size.upsert({ where: { code: s.code }, update: {}, create: s })
    sizes[s.code] = r.id
  }
  console.log('✅  Sizes')

  // ── Categories + Subcategories ───────────────────────────────────────────────
  type SubDef = { slug: string; name: string; sortOrder: number }
  type CatDef = {
    slug: string; name: string; image: string; subs: SubDef[]
  }

  const catDefs: CatDef[] = [
    {
      slug: 'tshirts',
      name: 'T-Shirts',
      image: IMG.tshirt[0],
      subs: [
        { slug: 'oversized', name: 'Oversized', sortOrder: 1 },
        { slug: 'polo', name: 'Polo', sortOrder: 2 },
        { slug: 'graphic', name: 'Graphic Tees', sortOrder: 3 },
        { slug: 'full-sleeve', name: 'Full Sleeve', sortOrder: 4 },
        { slug: 'henley', name: 'Henley', sortOrder: 5 },
      ],
    },
    {
      slug: 'hoodies',
      name: 'Hoodies & Sweatshirts',
      image: IMG.hoodie[0],
      subs: [
        { slug: 'pullover', name: 'Pullover Hoodies', sortOrder: 1 },
        { slug: 'zip-up', name: 'Zip-up Hoodies', sortOrder: 2 },
        { slug: 'cropped', name: 'Cropped Hoodies', sortOrder: 3 },
        { slug: 'sweatshirt', name: 'Sweatshirts', sortOrder: 4 },
        { slug: 'half-zip', name: 'Half-Zip', sortOrder: 5 },
      ],
    },
    {
      slug: 'bottoms',
      name: 'Bottoms',
      image: IMG.bottoms[0],
      subs: [
        { slug: 'joggers', name: 'Joggers', sortOrder: 1 },
        { slug: 'cargo-pants', name: 'Cargo Pants', sortOrder: 2 },
        { slug: 'track-pants', name: 'Track Pants', sortOrder: 3 },
        { slug: 'sweatpants', name: 'Sweatpants', sortOrder: 4 },
        { slug: 'chinos', name: 'Chinos', sortOrder: 5 },
      ],
    },
    {
      slug: 'shorts',
      name: 'Shorts',
      image: IMG.shorts[0],
      subs: [
        { slug: 'athletic', name: 'Athletic Shorts', sortOrder: 1 },
        { slug: 'cargo-shorts', name: 'Cargo Shorts', sortOrder: 2 },
        { slug: 'casual', name: 'Casual Shorts', sortOrder: 3 },
        { slug: 'board-shorts', name: 'Board Shorts', sortOrder: 4 },
        { slug: 'cycling', name: 'Cycling Shorts', sortOrder: 5 },
      ],
    },
    {
      slug: 'jackets',
      name: 'Jackets & Outerwear',
      image: IMG.jacket[0],
      subs: [
        { slug: 'bomber', name: 'Bomber Jackets', sortOrder: 1 },
        { slug: 'denim-jacket', name: 'Denim Jackets', sortOrder: 2 },
        { slug: 'windbreaker', name: 'Windbreakers', sortOrder: 3 },
        { slug: 'puffer', name: 'Puffer Jackets', sortOrder: 4 },
        { slug: 'fleece-jacket', name: 'Fleece Jackets', sortOrder: 5 },
      ],
    },
  ]

  const catIds: Record<string, string> = {}
  const subIds: Record<string, string> = {}

  for (const cat of catDefs) {
    const r = await prisma.productCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, image: cat.image },
      create: { slug: cat.slug, name: cat.name, image: cat.image },
    })
    catIds[cat.slug] = r.id
    for (const sub of cat.subs) {
      const sr = await prisma.productCategorySubcategory.upsert({
        where: { categoryId_slug: { categoryId: r.id, slug: sub.slug } },
        update: {},
        create: { categoryId: r.id, slug: sub.slug, name: sub.name, sortOrder: sub.sortOrder },
      })
      subIds[`${cat.slug}/${sub.slug}`] = sr.id
    }
  }
  console.log('✅  5 categories, 25 subcategories')

  // ── Product generation helpers ───────────────────────────────────────────────

  type VariantSpec = { size: string; quantity: number }
  type ProductSpec = {
    name: string
    slug: string
    description: string
    price: number
    discountPercent?: number
    audience: ProductAudience
    color: string
    catSlug: string
    subSlug: string
    imgPool: string[]
    imgOffset: number
    fabricSlug: string
    variants: VariantSpec[]
  }

  const tshirtVariants = (sizes: string[]) =>
    sizes.map((s) => ({ size: s, quantity: Math.floor(Math.random() * 20) + 5 }))

  const bottomVariants = (isNumeric: boolean) =>
    isNumeric
      ? ['28','30','32','34','36'].map((s) => ({ size: s, quantity: Math.floor(Math.random() * 15) + 5 }))
      : ['S','M','L','XL','XXL'].map((s) => ({ size: s, quantity: Math.floor(Math.random() * 15) + 5 }))

  const specs: ProductSpec[] = []

  // ── T-SHIRTS: 55 products ────────────────────────────────────────────────────

  const tshirtColors = ['White','Black','Navy','Olive','Charcoal','Stone','Sage Green','Rust','Burgundy','Camel','Lilac','Sky Blue','Coral','Beige','Graphite']
  const tshirtDescBases = [
    (color: string, name: string) => `Premium 100% cotton ${name.toLowerCase()} in ${color}. Soft, breathable and perfectly cut for all-day comfort.`,
    (color: string, name: string) => `Our best-selling ${name.toLowerCase()} in ${color}. Drop-shoulder silhouette with a relaxed fit — made for layering or wearing solo.`,
    (color: string, name: string) => `${color} ${name.toLowerCase()} crafted from heavyweight ringspun cotton. Holds its shape wash after wash.`,
    (color: string, name: string) => `Essential ${name.toLowerCase()} in ${color} — a wardrobe staple with a modern boxy fit and smooth finish.`,
  ]

  // Oversized (12 products)
  const oversizedNames = ['Drop Shoulder Tee','Boxy Fit Tee','Relaxed Fit Tee','Longline Oversized Tee','Classic Oversized Tee','Street-Fit Tee','Box Cut Tee','Wide Shoulder Tee','Heavy Oversized Tee','Utility Oversized Tee','Essential Drop Tee','Signature Oversized Tee']
  for (let i = 0; i < 12; i++) {
    const color = tshirtColors[i % tshirtColors.length]
    const name = `${color} ${oversizedNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: tshirtDescBases[i % 4](color, oversizedNames[i]),
      price: [699,799,849,899,999][i % 5],
      discountPercent: i % 3 === 0 ? [10,15,20,25][i % 4] : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'tshirts', subSlug: 'oversized',
      imgPool: IMG.tshirt, imgOffset: i,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Polo (10 products)
  const poloColors = ['Navy','White','Olive','Burgundy','Sky Blue','Charcoal','Forest Green','Mustard','Rust','Black']
  const poloNames = ['Classic Pique Polo','Slim Fit Polo','Relaxed Polo','Essential Polo','Sport Polo','Textured Polo','Vintage Polo','Performance Polo','Heritage Polo','Core Polo']
  for (let i = 0; i < 10; i++) {
    const color = poloColors[i]
    const name = `${color} ${poloNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `Classic ${name.toLowerCase()} crafted from premium pique cotton. Ribbed collar, 2-button placket and structured fit — smart-casual perfection.`,
      price: [1099,1199,1299,1399][i % 4],
      discountPercent: i % 4 === 0 ? 10 : undefined,
      audience: i % 4 === 0 ? 'WOMEN' : 'MEN',
      catSlug: 'tshirts', subSlug: 'polo',
      imgPool: IMG.tshirt, imgOffset: i + 3,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Graphic Tees (12 products)
  const graphicNames = ['City Skyline Graphic Tee','Abstract Art Tee','Retro Logo Tee','Band-Style Print Tee','Botanical Print Tee','Geometric Print Tee','Vintage Typography Tee','Grunge Print Tee','Minimal Graphic Tee','Celestial Print Tee','Streetwear Print Tee','Hand-Drawn Art Tee']
  for (let i = 0; i < 12; i++) {
    const color = ['Black','White','Charcoal','Beige','Navy','Stone'][i % 6]
    const name = `${graphicNames[i]} in ${color}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `Statement ${graphicNames[i].toLowerCase()} on ${color} — screen-printed on 180gsm cotton. Bold, wash-resistant artwork that lasts.`,
      price: [899,999,1099,1199][i % 4],
      discountPercent: i % 3 === 0 ? 15 : i % 5 === 0 ? 20 : undefined,
      audience: i % 2 === 0 ? 'UNISEX' : 'MEN',
      catSlug: 'tshirts', subSlug: 'graphic',
      imgPool: IMG.tshirt, imgOffset: i + 5,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Full Sleeve (11 products)
  const fullSleeveColors = ['White','Navy','Black','Olive','Burgundy','Charcoal','Stone','Rust','Sky Blue','Forest Green','Beige']
  const fullSleeveNames = ['Classic Full Sleeve Tee','Thumbhole Sleeve Tee','Raglan Full Sleeve','Baseball Full Sleeve Tee','Ribbed Sleeve Tee','Crew Neck Long Sleeve','Striped Full Sleeve','Mock Neck Long Sleeve','Oversized Long Sleeve','Slim Long Sleeve Tee','Henley Long Sleeve']
  for (let i = 0; i < 11; i++) {
    const color = fullSleeveColors[i]
    const name = `${color} ${fullSleeveNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${fullSleeveNames[i].toLowerCase()} — ideal for layering or standalone wear. Soft cotton-blend fabric with a comfortable regular fit.`,
      price: [899,999,1099,1199,1299][i % 5],
      discountPercent: i % 4 === 0 ? 10 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'tshirts', subSlug: 'full-sleeve',
      imgPool: IMG.tshirt, imgOffset: i + 7,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['XS','S','M','L','XL']),
    })
  }

  // Henley (10 products)
  const henleyColors = ['White','Navy','Charcoal','Olive','Rust','Stone','Beige','Black','Sage Green','Lilac']
  for (let i = 0; i < 10; i++) {
    const color = henleyColors[i]
    const name = `${color} Henley Tee ${['Classic','Relaxed','Slim Fit','Raglan','Boxy','Ribbed','Vintage','Essential','Sport','Premium'][i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} Henley with 3-button placket and a soft, breathable cotton blend. Versatile enough for casual and smart-casual looks.`,
      price: [999,1099,1199][i % 3],
      discountPercent: i % 5 === 0 ? 10 : undefined,
      audience: i % 4 === 0 ? 'WOMEN' : 'MEN',
      catSlug: 'tshirts', subSlug: 'henley',
      imgPool: IMG.tshirt, imgOffset: i + 9,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // ── HOODIES & SWEATSHIRTS: 50 products ──────────────────────────────────────

  const hoodieColors = ['Charcoal','Black','Navy','Olive','Stone','Cream','Burgundy','Forest Green','Sky Blue','Dusty Rose','Graphite','Rust']

  // Pullover Hoodies (11 products)
  const pulloverNames = ['Classic Pullover Hoodie','Heavyweight Pullover Hoodie','Fleece Lined Hoodie','Vintage Pullover Hoodie','Essential Hoodie','Kangaroo Pocket Hoodie','Slim Fit Pullover','Relaxed Fit Pullover','Athletic Pullover Hoodie','French Terry Hoodie','Brushed Cotton Hoodie']
  for (let i = 0; i < 11; i++) {
    const color = hoodieColors[i % hoodieColors.length]
    const name = `${color} ${pulloverNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${pulloverNames[i].toLowerCase()} — ultra-soft fleece interior with adjustable drawstring. Ideal for layering or relaxed everyday wear.`,
      price: [1799,1999,2199,2399][i % 4],
      discountPercent: i % 3 === 0 ? [10,15,20][i % 3] : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'hoodies', subSlug: 'pullover',
      imgPool: IMG.hoodie, imgOffset: i,
      fabricSlug: 'fleece',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Zip-up (10 products)
  const zipNames = ['Classic Zip-up Hoodie','Tech Fleece Zip-up','Lightweight Zip Hoodie','Full-Zip Athletic Hoodie','Performance Zip Hoodie','Varsity Zip Hoodie','Slim Zip-up','Textured Zip Hoodie','Contrast Zip Hoodie','Essential Zip Hoodie']
  for (let i = 0; i < 10; i++) {
    const color = hoodieColors[(i + 2) % hoodieColors.length]
    const name = `${color} ${zipNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${zipNames[i].toLowerCase()} — full-length zip with side pockets and a clean interior finish. Great for sport or street styling.`,
      price: [1999,2199,2499,2699][i % 4],
      discountPercent: i % 4 === 0 ? 15 : undefined,
      audience: i % 2 === 0 ? 'MEN' : 'UNISEX',
      catSlug: 'hoodies', subSlug: 'zip-up',
      imgPool: IMG.hoodie, imgOffset: i + 2,
      fabricSlug: 'polyester',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Cropped Hoodies (9 products)
  const croppedNames = ['Cropped Fleece Hoodie','Crop Zip Hoodie','Cropped Pullover','Boxy Crop Hoodie','Ribbed Crop Hoodie','Cropped Sport Hoodie','Vintage Crop Hoodie','French Terry Crop','Essential Crop Hoodie']
  for (let i = 0; i < 9; i++) {
    const color = hoodieColors[(i + 4) % hoodieColors.length]
    const name = `${color} ${croppedNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${croppedNames[i].toLowerCase()} — cropped silhouette hits at the waist. Pair with high-waisted joggers or shorts for a trendy co-ord look.`,
      price: [1499,1699,1899][i % 3],
      discountPercent: i % 3 === 0 ? 20 : undefined,
      audience: 'WOMEN',
      catSlug: 'hoodies', subSlug: 'cropped',
      imgPool: IMG.hoodie, imgOffset: i + 4,
      fabricSlug: 'fleece',
      variants: tshirtVariants(['XS','S','M','L','XL']),
    })
  }

  // Sweatshirts (10 products)
  const sweatNames = ['Classic Crew Sweatshirt','Oversized Sweatshirt','French Terry Sweatshirt','Vintage Crewneck','Boxy Sweatshirt','Ribbed Hem Sweatshirt','Colour Block Sweatshirt','Essential Crewneck','Athletic Sweatshirt','Varsity Crewneck']
  for (let i = 0; i < 10; i++) {
    const color = hoodieColors[(i + 1) % hoodieColors.length]
    const name = `${color} ${sweatNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${sweatNames[i].toLowerCase()} — crew-neck construction in soft cotton-fleece blend. A relaxed streetwear essential for any wardrobe.`,
      price: [1399,1599,1799,1899][i % 4],
      discountPercent: i % 5 === 0 ? 10 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'hoodies', subSlug: 'sweatshirt',
      imgPool: IMG.hoodie, imgOffset: i + 6,
      fabricSlug: 'fleece',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Half-zip (10 products)
  const halfZipNames = ['Classic Half-Zip Pullover','Fleece Half-Zip','Performance Half-Zip','Textured Half-Zip','Athletic Half-Zip Top','Quarter-Zip Sweatshirt','Microfibre Half-Zip','Essential Half-Zip','Slim Half-Zip','Sport Quarter-Zip']
  for (let i = 0; i < 10; i++) {
    const color = hoodieColors[(i + 3) % hoodieColors.length]
    const name = `${color} ${halfZipNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${halfZipNames[i].toLowerCase()} — quarter-zip neckline with a soft brushed interior. Sport-meets-street aesthetic for active days.`,
      price: [1699,1899,2099][i % 3],
      discountPercent: i % 4 === 0 ? 12 : undefined,
      audience: i % 2 === 0 ? 'MEN' : 'UNISEX',
      catSlug: 'hoodies', subSlug: 'half-zip',
      imgPool: IMG.hoodie, imgOffset: i + 8,
      fabricSlug: 'polyester',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // ── BOTTOMS: 50 products ─────────────────────────────────────────────────────

  const bottomColors = ['Black','Navy','Charcoal','Olive','Khaki','Stone','Rust','Forest Green','Beige','Grey']

  // Joggers (12 products)
  const joggerNames = ['Classic Slim Jogger','Relaxed Tapered Jogger','French Terry Jogger','Fleece Lined Jogger','Lightweight Jogger','Cuffed Slim Jogger','Varsity Jogger','Ribbed Jogger','Essential Jogger','Performance Jogger','Wide Leg Jogger','Cropped Jogger']
  for (let i = 0; i < 12; i++) {
    const color = bottomColors[i % bottomColors.length]
    const name = `${color} ${joggerNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${joggerNames[i].toLowerCase()} — elasticated waistband and tapered fit in soft polyester-blend fabric. Comfortable from home to the streets.`,
      price: [1299,1399,1499,1599][i % 4],
      discountPercent: i % 4 === 0 ? 15 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'bottoms', subSlug: 'joggers',
      imgPool: IMG.bottoms, imgOffset: i,
      fabricSlug: 'polyester',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Cargo Pants (10 products)
  const cargoPantNames = ['6-Pocket Cargo Pant','Slim Cargo Pant','Relaxed Cargo Pant','Utility Cargo Pant','Tactical Cargo Pant','Ripstop Cargo Pant','Drawstring Cargo Pant','Parachute Cargo Pant','Wide-Leg Cargo','Straight Fit Cargo']
  for (let i = 0; i < 10; i++) {
    const color = bottomColors[(i + 2) % bottomColors.length]
    const name = `${color} ${cargoPantNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${cargoPantNames[i].toLowerCase()} — multiple pockets for maximum utility. Heavy-duty cotton-blend fabric with adjustable waist.`,
      price: [1799,1999,2199,2399][i % 4],
      discountPercent: i % 3 === 0 ? 10 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : 'MEN',
      catSlug: 'bottoms', subSlug: 'cargo-pants',
      imgPool: IMG.bottoms, imgOffset: i + 2,
      fabricSlug: 'cotton',
      variants: bottomVariants(false),
    })
  }

  // Track Pants (10 products)
  const trackPantNames = ['Classic Track Pant','Slim Track Pant','Tapered Track Pant','Striped Track Pant','Sport Track Pant','Satin Track Pant','Woven Track Pant','Lightweight Track Pant','Colour-Block Track Pant','Essential Track Pant']
  for (let i = 0; i < 10; i++) {
    const color = bottomColors[(i + 1) % bottomColors.length]
    const name = `${color} ${trackPantNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${trackPantNames[i].toLowerCase()} — smooth polyester weave with side stripe detailing. Comfortable for training or casual wear.`,
      price: [1399,1499,1599,1699][i % 4],
      discountPercent: i % 5 === 0 ? 12 : undefined,
      audience: i % 2 === 0 ? 'MEN' : 'UNISEX',
      catSlug: 'bottoms', subSlug: 'track-pants',
      imgPool: IMG.bottoms, imgOffset: i + 4,
      fabricSlug: 'polyester',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Sweatpants (9 products)
  const sweatpantNames = ['Fleece Sweatpant','French Terry Sweatpant','Wide Leg Sweatpant','Slim Sweatpant','Classic Sweatpant','Baggy Sweatpant','Cropped Sweatpant','Ribbed Sweatpant','Essential Sweatpant']
  for (let i = 0; i < 9; i++) {
    const color = bottomColors[(i + 3) % bottomColors.length]
    const name = `${color} ${sweatpantNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${sweatpantNames[i].toLowerCase()} — plush fleece interior with relaxed fit and elasticated hem. Maximum comfort for lounging and beyond.`,
      price: [1199,1299,1399,1499][i % 4],
      discountPercent: i % 3 === 0 ? 15 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'bottoms', subSlug: 'sweatpants',
      imgPool: IMG.bottoms, imgOffset: i + 6,
      fabricSlug: 'fleece',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Chinos (9 products)
  const chinoColors = ['Beige','Khaki','Navy','Olive','Stone','Charcoal','Rust','Forest Green','Slate']
  const chinoNames = ['Slim Fit Chino','Relaxed Chino','Tapered Chino','Classic Chino','Stretch Chino','Ankle Chino','Wide Leg Chino','Performance Chino','Essential Chino']
  for (let i = 0; i < 9; i++) {
    const color = chinoColors[i]
    const name = `${color} ${chinoNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${chinoNames[i].toLowerCase()} — polished cotton-twill construction. Smart enough for office casual, relaxed enough for weekends.`,
      price: [1699,1899,1999][i % 3],
      discountPercent: i % 5 === 0 ? 10 : undefined,
      audience: i % 4 === 0 ? 'WOMEN' : 'MEN',
      catSlug: 'bottoms', subSlug: 'chinos',
      imgPool: IMG.bottoms, imgOffset: i + 8,
      fabricSlug: 'cotton',
      variants: bottomVariants(false),
    })
  }

  // ── SHORTS: 40 products ──────────────────────────────────────────────────────

  const shortColors = ['Black','Navy','Olive','Khaki','Charcoal','Stone','Rust','Beige','Forest Green','Sky Blue']

  // Athletic Shorts (9 products)
  const athleticShortNames = ['5-inch Athletic Short','7-inch Running Short','Mesh Lined Short','Compression Short','Quick-Dry Athletic Short','Performance Run Short','Sport Short','Lightweight Run Short','Gym Short']
  for (let i = 0; i < 9; i++) {
    const color = shortColors[i % shortColors.length]
    const name = `${color} ${athleticShortNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${athleticShortNames[i].toLowerCase()} — lightweight quick-dry fabric with built-in liner. Engineered for performance running and training.`,
      price: [799,899,999,1099][i % 4],
      discountPercent: i % 3 === 0 ? 10 : undefined,
      audience: i % 4 === 0 ? 'WOMEN' : 'MEN',
      catSlug: 'shorts', subSlug: 'athletic',
      imgPool: IMG.shorts, imgOffset: i,
      fabricSlug: 'polyester',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Cargo Shorts (8 products)
  const cargoShortNames = ['6-Pocket Cargo Short','Tactical Short','Ripstop Cargo Short','Utility Short','Slim Cargo Short','Relaxed Cargo Short','Parachute Cargo Short','Essential Cargo Short']
  for (let i = 0; i < 8; i++) {
    const color = shortColors[(i + 2) % shortColors.length]
    const name = `${color} ${cargoShortNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${cargoShortNames[i].toLowerCase()} — utility pockets with button-flap closure. Versatile warm-weather essential for active days.`,
      price: [1099,1199,1299][i % 3],
      discountPercent: i % 4 === 0 ? 15 : undefined,
      audience: 'MEN',
      catSlug: 'shorts', subSlug: 'cargo-shorts',
      imgPool: IMG.shorts, imgOffset: i + 2,
      fabricSlug: 'cotton',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Casual Shorts (8 products)
  const casualShortNames = ['Linen Casual Short','Cotton Chino Short','Elastic Waist Short','Relaxed Casual Short','Classic Bermuda','Drawstring Short','Jersey Short','Easy Fit Short']
  for (let i = 0; i < 8; i++) {
    const color = shortColors[(i + 1) % shortColors.length]
    const name = `${color} ${casualShortNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${casualShortNames[i].toLowerCase()} — easy everyday shorts made from breathable ${['linen','cotton','cotton-blend'][i % 3]}. Simple, comfortable, stylish.`,
      price: [899,999,1099,1199][i % 4],
      discountPercent: i % 4 === 0 ? 10 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : 'UNISEX',
      catSlug: 'shorts', subSlug: 'casual',
      imgPool: IMG.shorts, imgOffset: i + 3,
      fabricSlug: i % 3 === 0 ? 'linen' : 'cotton',
      variants: tshirtVariants(['XS','S','M','L','XL']),
    })
  }

  // Board Shorts (8 products)
  const boardShortNames = ['Classic Board Short','Surf Board Short','Quick-Dry Beach Short','Tropical Print Short','Solid Board Short','Lined Board Short','Volley Short','Drawstring Board Short']
  for (let i = 0; i < 8; i++) {
    const color = ['Navy','Black','Olive','Sky Blue','Stone','Khaki','Charcoal','Forest Green'][i]
    const name = `${color} ${boardShortNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${boardShortNames[i].toLowerCase()} — water-resistant quick-dry fabric. Mesh lining and elastic waist with drawstring for a secure fit in and out of the water.`,
      price: [999,1099,1199,1299][i % 4],
      discountPercent: i % 3 === 0 ? 20 : undefined,
      audience: 'MEN',
      catSlug: 'shorts', subSlug: 'board-shorts',
      imgPool: IMG.shorts, imgOffset: i + 5,
      fabricSlug: 'nylon',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Cycling Shorts (7 products)
  const cyclingShortNames = ['Compression Cycling Short','High-Waist Cycling Short','Padded Cycling Short','Biker Short','Seamless Biker Short','Sport Cycling Short','Essential Cycling Short']
  for (let i = 0; i < 7; i++) {
    const color = ['Black','Charcoal','Navy','Olive','Stone','Burgundy','Graphite'][i]
    const name = `${color} ${cyclingShortNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${cyclingShortNames[i].toLowerCase()} — 4-way stretch spandex blend with a high-waist compression fit. Perfect for cycling, yoga, and high-intensity training.`,
      price: [899,999,1099,1199][i % 4],
      discountPercent: i % 3 === 0 ? 10 : undefined,
      audience: 'WOMEN',
      catSlug: 'shorts', subSlug: 'cycling',
      imgPool: IMG.shorts, imgOffset: i + 7,
      fabricSlug: 'spandex',
      variants: tshirtVariants(['XS','S','M','L','XL']),
    })
  }

  // ── JACKETS & OUTERWEAR: 50 products ────────────────────────────────────────

  const jacketColors = ['Black','Navy','Olive','Khaki','Charcoal','Rust','Cream','Forest Green','Stone','Camel','Burgundy','Graphite']

  // Bomber Jackets (11 products)
  const bomberNames = ['Classic Bomber Jacket','Satin Bomber Jacket','Varsity Bomber','MA-1 Flight Jacket','Lightweight Bomber','Padded Bomber','Embroidered Bomber','Puffer Bomber','Nylon Bomber Jacket','Velvet Bomber Jacket','Baseball Jacket']
  for (let i = 0; i < 11; i++) {
    const color = jacketColors[i % jacketColors.length]
    const name = `${color} ${bomberNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${bomberNames[i].toLowerCase()} — ribbed collar, cuffs and hem with a zip front. Statement outerwear for the season.`,
      price: [2499,2799,2999,3199,3499][i % 5],
      discountPercent: i % 3 === 0 ? [10,15,20][i % 3] : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'jackets', subSlug: 'bomber',
      imgPool: IMG.jacket, imgOffset: i,
      fabricSlug: 'nylon',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Denim Jackets (9 products)
  const denimJacketNames = ['Classic Denim Jacket','Oversized Denim Jacket','Cropped Denim Jacket','Washed Denim Jacket','Dark Wash Denim Jacket','Light Wash Denim Jacket','Sherpa Lined Denim Jacket','Slim Fit Denim Jacket','Distressed Denim Jacket']
  const denimColors = ['Light Blue','Dark Blue','Black','Indigo','Medium Wash','Raw Denim','Acid Wash','Vintage Blue','Charcoal']
  for (let i = 0; i < 9; i++) {
    const color = denimColors[i]
    const name = `${color} ${denimJacketNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${denimJacketNames[i].toLowerCase()} — premium denim construction with chest pockets and button front. A wardrobe investment that only gets better with age.`,
      price: [2299,2499,2699,2899][i % 4],
      discountPercent: i % 4 === 0 ? 10 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'jackets', subSlug: 'denim-jacket',
      imgPool: IMG.jacket, imgOffset: i + 2,
      fabricSlug: 'denim',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Windbreakers (10 products)
  const windbreakNames = ['Classic Windbreaker','Packable Windbreaker','Hooded Windbreaker','Colour Block Windbreaker','Zip-off Windbreaker','Lightweight Shell','Running Windbreaker','Mountain Windbreaker','Pullover Anorak','Sport Windbreaker']
  for (let i = 0; i < 10; i++) {
    const color = jacketColors[(i + 3) % jacketColors.length]
    const name = `${color} ${windbreakNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${windbreakNames[i].toLowerCase()} — water-resistant nylon shell that packs into its own pocket. Seam-sealed and breathable for all-weather performance.`,
      price: [1999,2199,2399,2599][i % 4],
      discountPercent: i % 4 === 0 ? 15 : undefined,
      audience: i % 2 === 0 ? 'MEN' : 'UNISEX',
      catSlug: 'jackets', subSlug: 'windbreaker',
      imgPool: IMG.jacket, imgOffset: i + 4,
      fabricSlug: 'nylon',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // Puffer Jackets (10 products)
  const pufferNames = ['Classic Puffer Jacket','Lightweight Down Jacket','Padded Puffer Vest','Cropped Puffer Jacket','Oversized Puffer','Short Puffer Jacket','Long Puffer Coat','Holographic Puffer','Hooded Puffer Jacket','Ultra Light Puffer']
  for (let i = 0; i < 10; i++) {
    const color = jacketColors[(i + 1) % jacketColors.length]
    const name = `${color} ${pufferNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${pufferNames[i].toLowerCase()} — down-fill or synthetic insulation in a water-resistant shell. Lightweight warmth without the bulk.`,
      price: [2999,3299,3499,3799,3999][i % 5],
      discountPercent: i % 3 === 0 ? 20 : i % 5 === 0 ? 15 : undefined,
      audience: i % 3 === 0 ? 'WOMEN' : i % 3 === 1 ? 'MEN' : 'UNISEX',
      catSlug: 'jackets', subSlug: 'puffer',
      imgPool: IMG.jacket, imgOffset: i + 6,
      fabricSlug: 'nylon',
      variants: tshirtVariants(['XS','S','M','L','XL','XXL']),
    })
  }

  // Fleece Jackets (10 products)
  const fleeceJacketNames = ['Classic Fleece Jacket','Zip-up Fleece Jacket','Polartec Fleece','Sherpa Fleece Jacket','Slim Fleece Jacket','Reversible Fleece Jacket','Hooded Fleece Jacket','Lightweight Fleece','Full Zip Fleece','Quarter Zip Fleece']
  for (let i = 0; i < 10; i++) {
    const color = jacketColors[(i + 5) % jacketColors.length]
    const name = `${color} ${fleeceJacketNames[i]}`
    specs.push({
      name, slug: toSlug(name), color,
      description: `${color} ${fleeceJacketNames[i].toLowerCase()} — anti-pill microfleece with a smooth face and zippered pockets. Warm, lightweight and machine washable.`,
      price: [1799,1999,2199,2399][i % 4],
      discountPercent: i % 4 === 0 ? 10 : undefined,
      audience: i % 2 === 0 ? 'UNISEX' : 'MEN',
      catSlug: 'jackets', subSlug: 'fleece-jacket',
      imgPool: IMG.jacket, imgOffset: i + 8,
      fabricSlug: 'fleece',
      variants: tshirtVariants(['S','M','L','XL','XXL']),
    })
  }

  // ── Create products in DB ─────────────────────────────────────────────────────
  console.log(`\n📦  Creating ${specs.length} products...`)

  let created = 0
  let skipped = 0

  for (const p of specs) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } })
    if (existing) { skipped++; continue }

    const [img1, img2] = pickTwo(p.imgPool, p.imgOffset)
    const totalQty = p.variants.reduce((acc, v) => acc + v.quantity, 0)

    await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: p.price,
        discountPercent: p.discountPercent ?? null,
        audience: p.audience,
        color: p.color,
        quantity: totalQty,
        isAvailable: true,
        categoryId: catIds[p.catSlug],
        subcategoryId: subIds[`${p.catSlug}/${p.subSlug}`],
        gstRate: 0.18,
        metaTitle: p.name,
        metaDescription: p.description.slice(0, 160),
        images: {
          create: [
            { path: img1, sortOrder: 0 },
            { path: img2, sortOrder: 1 },
          ],
        },
        variants: {
          create: p.variants.map((v) => ({
            size: v.size,
            color: p.color,
            quantity: v.quantity,
            sizeId: sizes[v.size] ?? null,
          })),
        },
        productFabrics: {
          create: [{ fabricId: fabrics[p.fabricSlug], percent: 100 }],
        },
      },
    })
    created++
    if (created % 25 === 0) console.log(`   ... ${created} created`)
  }

  console.log(`✅  Products: ${created} created, ${skipped} already existed`)

  // ── Banners ───────────────────────────────────────────────────────────────────
  const bannerCount = await prisma.banner.count()
  if (bannerCount === 0) {
    await prisma.banner.createMany({
      data: [
        { title: 'New Season Drop', subtitle: 'Explore our latest collection of premium streetwear', imageUrl: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1600&q=80', linkUrl: '/products', position: 'hero', isActive: true, sortOrder: 1 },
        { title: 'Hoodies & Sweatshirts', subtitle: 'Stay warm and stylish this season', imageUrl: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=1600&q=80', linkUrl: '/products?category=hoodies', position: 'hero', isActive: true, sortOrder: 2 },
        { title: "Shop Women's Collection", subtitle: 'Curated pieces designed for the modern woman', imageUrl: 'https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?w=1600&q=80', linkUrl: '/products', position: 'mid', isActive: true, sortOrder: 1 },
        { title: 'Jackets & Outerwear', subtitle: 'Layer up in style — new arrivals now in', imageUrl: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=1600&q=80', linkUrl: '/products?category=jackets', position: 'mid', isActive: true, sortOrder: 2 },
        { title: 'Free Shipping on ₹999+', subtitle: 'Use code FREESHIP at checkout. Limited time.', imageUrl: 'https://images.unsplash.com/photo-1607082349566-187342175e2f?w=1600&q=80', linkUrl: '/products', position: 'footer', isActive: true, sortOrder: 1 },
      ],
    })
    console.log('✅  Banners')
  } else {
    console.log('⏭️  Banners already exist, skipping')
  }

  // ── Flash Sale ────────────────────────────────────────────────────────────────
  const flashCount = await prisma.flashSale.count({ where: { isActive: true } })
  if (flashCount === 0) {
    const now = new Date()
    const ends = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const saleProducts = await prisma.product.findMany({ take: 20, orderBy: { createdAt: 'desc' }, select: { id: true } })
    await prisma.flashSale.create({
      data: { title: 'New Launch Sale', discountPercent: 30, startsAt: now, endsAt: ends, isActive: true, productIds: saleProducts.map((p) => p.id) },
    })
    console.log('✅  Flash sale (30% off, 7 days, 20 products)')
  } else {
    console.log('⏭️  Flash sale already active')
  }

  // ── Coupons ───────────────────────────────────────────────────────────────────
  const coupons = [
    { code: 'WELCOME20', discountType: CouponDiscountType.PERCENT, value: 20, minSubtotal: 500, maxDiscount: 300, usageLimit: 1000, perUserLimit: 1 },
    { code: 'FLAT100', discountType: CouponDiscountType.FIXED, value: 100, minSubtotal: 999 },
    { code: 'SUMMER30', discountType: CouponDiscountType.PERCENT, value: 30, minSubtotal: 1500, maxDiscount: 500, usageLimit: 500, perUserLimit: 2 },
    { code: 'FREESHIP', discountType: CouponDiscountType.FIXED, value: 99, minSubtotal: 999, usageLimit: 2000 },
    { code: 'NEWDROP15', discountType: CouponDiscountType.PERCENT, value: 15, minSubtotal: 800, maxDiscount: 400, usageLimit: 500 },
    { code: 'HOODIE10', discountType: CouponDiscountType.PERCENT, value: 10, minSubtotal: 1500, usageLimit: 300 },
  ]
  for (const c of coupons) {
    await prisma.coupon.upsert({ where: { code: c.code }, update: {}, create: { ...c, isActive: true } })
  }
  console.log('✅  Coupons')

  // ── Loyalty settings ──────────────────────────────────────────────────────────
  await prisma.loyaltySetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', pointsPerRupee: 1, rupeePerPoint: 0.25, minRedeemPoints: 100, maxRedeemPercent: 20, referralBonus: 200, referredBonus: 100, orderEarnMultiplier: 1 },
  })

  // ── Cancellation reasons ──────────────────────────────────────────────────────
  const reasonCount = await prisma.cancellationReason.count()
  if (reasonCount === 0) {
    await prisma.cancellationReason.createMany({
      data: [
        { label: 'Ordered by mistake', sortOrder: 1 },
        { label: 'Found a better price elsewhere', sortOrder: 2 },
        { label: 'Delivery is taking too long', sortOrder: 3 },
        { label: 'Changed my mind', sortOrder: 4 },
        { label: 'Incorrect item ordered', sortOrder: 5 },
        { label: 'Product no longer needed', sortOrder: 6 },
        { label: 'Other', sortOrder: 7 },
      ],
    })
  }

  // ── Demo address ──────────────────────────────────────────────────────────────
  const addressCount = await prisma.userAddress.count({ where: { userId: demoUser.id } })
  if (addressCount === 0) {
    await prisma.userAddress.create({
      data: { userId: demoUser.id, label: 'Home', fullName: 'Demo User', phone: '9876543210', line1: '42 MG Road', line2: 'Near City Mall', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009', country: 'India', isDefault: true },
    })
  }

  const total = await prisma.product.count()
  console.log('\n🎉  Seeding complete!')
  console.log(`\n📊  Database summary:`)
  console.log(`   Products: ${total}`)
  console.log(`   Categories: 5 | Subcategories: 25`)
  console.log('\n📋  Quick reference:')
  console.log('   Admin:  admin@disentclub.com / Admin@123')
  console.log('   Demo:   demo@disentclub.com / Demo@123')
  console.log('   Coupons: WELCOME20 | FLAT100 | SUMMER30 | FREESHIP | NEWDROP15 | HOODIE10')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
