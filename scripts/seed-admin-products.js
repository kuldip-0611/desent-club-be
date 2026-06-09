/* eslint-disable no-console */
/**
 * Full catalog reseed: categories, subcategories, 200 products, coupons, user groups.
 *
 * Usage: node scripts/seed-admin-products.js
 *        yarn db:seed-products
 */
const { PrismaClient, ProductAudience, CouponDiscountType } = require('@prisma/client')
const bcrypt = require('bcrypt')

const prisma = new PrismaClient()

const TARGET_PRODUCT_COUNT = 200

const COLOR_SET = [
  'Black', 'White', 'Navy', 'Charcoal', 'Olive', 'Maroon',
  'Sky Blue', 'Beige', 'Lavender', 'Mint', 'Mustard', 'Coral',
]

const IMAGE_POOL = [
  'https://images.pexels.com/photos/9558761/pexels-photo-9558761.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/7679720/pexels-photo-7679720.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311606/pexels-photo-6311606.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/428340/pexels-photo-428340.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311644/pexels-photo-6311644.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311598/pexels-photo-6311598.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311640/pexels-photo-6311640.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/8173478/pexels-photo-8173478.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1040945/pexels-photo-1040945.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1183266/pexels-photo-1183266.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1124468/pexels-photo-1124468.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/1043474/pexels-photo-1043474.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1527719327859-c6ce80353573?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1464863979621-258859e62245?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=1200&q=80',
]

const CATALOG = [
  {
    slug: 'tshirts',
    name: 'Tshirts',
    imageIndex: 0,
    productCount: 40,
    names: ['Classic Crew Tshirt', 'Oversized Street Tshirt', 'Athletic Dry Fit Tshirt', 'Vintage Wash Tshirt', 'Logo Essential Tshirt', 'Graphic Print Tee', 'Polo Style Tshirt'],
    description: 'Premium cotton-rich t-shirt built for comfort, movement, and daily wear.',
    subcategories: [
      { name: 'Round neck', slug: 'round-neck', imageIndex: 2 },
      { name: 'V-neck', slug: 'v-neck', imageIndex: 3 },
      { name: 'Oversized', slug: 'oversized', imageIndex: 4 },
      { name: 'Anime print', slug: 'anime-print', imageIndex: 5 },
      { name: 'Graphic', slug: 'graphic', imageIndex: 6 },
    ],
    fabrics: ['cotton', 'spandex'],
    attrs: ['chest', 'shoulder', 'length'],
    basePrice: 899,
  },
  {
    slug: 'tracks',
    name: 'Tracks',
    imageIndex: 1,
    productCount: 40,
    names: ['Performance Track Pants', 'Relaxed Jogger Tracks', 'Training Core Tracks', 'Zip Pocket Tracks', 'Everyday Comfort Tracks', 'Slim Fit Tracks', 'Cargo Track Pants'],
    description: 'Performance tracks made for training sessions and relaxed everyday styling.',
    subcategories: [
      { name: 'Joggers', slug: 'joggers', imageIndex: 7 },
      { name: 'Training', slug: 'training', imageIndex: 8 },
      { name: 'Relaxed fit', slug: 'relaxed-fit', imageIndex: 9 },
      { name: 'Slim fit', slug: 'slim-fit', imageIndex: 10 },
    ],
    fabrics: ['polyester', 'elastane'],
    attrs: ['waist', 'hip', 'inseam'],
    basePrice: 1499,
  },
  {
    slug: 'hoodies',
    name: 'Hoodies',
    imageIndex: 12,
    productCount: 40,
    names: ['Urban Zip Hoodie', 'Classic Pullover Hoodie', 'Fleece Comfort Hoodie', 'Oversized Street Hoodie', 'Athletic Warmup Hoodie', 'Minimal Logo Hoodie'],
    description: 'Soft fleece hoodies with premium stitching for street and sport style.',
    subcategories: [
      { name: 'Pullover', slug: 'pullover', imageIndex: 13 },
      { name: 'Zip-up', slug: 'zip-up', imageIndex: 14 },
      { name: 'Oversized', slug: 'oversized-hoodie', imageIndex: 15 },
      { name: 'Fleece', slug: 'fleece', imageIndex: 16 },
    ],
    fabrics: ['french-terry', 'cotton'],
    attrs: ['chest', 'shoulder', 'length'],
    basePrice: 1799,
  },
  {
    slug: 'shorts',
    name: 'Shorts',
    imageIndex: 17,
    productCount: 40,
    names: ['Training Shorts', 'Casual Chino Shorts', 'Running Shorts', 'Cargo Shorts', 'Lounge Shorts', 'Basketball Shorts'],
    description: 'Lightweight shorts designed for workouts, travel, and everyday comfort.',
    subcategories: [
      { name: 'Athletic', slug: 'athletic', imageIndex: 18 },
      { name: 'Casual', slug: 'casual', imageIndex: 19 },
      { name: 'Cargo', slug: 'cargo', imageIndex: 20 },
    ],
    fabrics: ['polyester', 'nylon'],
    attrs: ['waist', 'hip', 'inseam'],
    basePrice: 799,
  },
  {
    slug: 'jackets',
    name: 'Jackets',
    imageIndex: 21,
    productCount: 40,
    names: ['Windbreaker Jacket', 'Bomber Jacket', 'Puffer Jacket', 'Denim Jacket', 'Track Jacket', 'Lightweight Shell'],
    description: 'Layer-ready jackets with weather-ready fabrics and modern fits.',
    subcategories: [
      { name: 'Windbreaker', slug: 'windbreaker', imageIndex: 22 },
      { name: 'Bomber', slug: 'bomber', imageIndex: 23 },
      { name: 'Puffer', slug: 'puffer', imageIndex: 0 },
      { name: 'Track', slug: 'track-jacket', imageIndex: 1 },
    ],
    fabrics: ['nylon', 'polyester'],
    attrs: ['chest', 'shoulder', 'length'],
    basePrice: 2199,
  },
]

const FABRICS = [
  { slug: 'cotton', name: 'Cotton', sortOrder: 1 },
  { slug: 'polyester', name: 'Polyester', sortOrder: 2 },
  { slug: 'spandex', name: 'Spandex', sortOrder: 3 },
  { slug: 'french-terry', name: 'French Terry', sortOrder: 4 },
  { slug: 'nylon', name: 'Nylon', sortOrder: 5 },
  { slug: 'elastane', name: 'Elastane', sortOrder: 6 },
]

const MEASUREMENT_ATTRIBUTES = [
  { slug: 'chest', label: 'Chest', unit: 'cm', sortOrder: 1 },
  { slug: 'shoulder', label: 'Shoulder', unit: 'cm', sortOrder: 2 },
  { slug: 'length', label: 'Length', unit: 'cm', sortOrder: 3 },
  { slug: 'waist', label: 'Waist', unit: 'cm', sortOrder: 4 },
  { slug: 'hip', label: 'Hip', unit: 'cm', sortOrder: 5 },
  { slug: 'inseam', label: 'Inseam', unit: 'cm', sortOrder: 6 },
]

const SIZE_CHART = [
  { code: 'S', name: 'Small', sortOrder: 1, measurements: { chest: '96', shoulder: '42', length: '68', waist: '76', hip: '94', inseam: '74' } },
  { code: 'M', name: 'Medium', sortOrder: 2, measurements: { chest: '102', shoulder: '44', length: '70', waist: '82', hip: '100', inseam: '76' } },
  { code: 'L', name: 'Large', sortOrder: 3, measurements: { chest: '108', shoulder: '46', length: '72', waist: '88', hip: '106', inseam: '78' } },
  { code: 'XL', name: 'Extra Large', sortOrder: 4, measurements: { chest: '114', shoulder: '48', length: '74', waist: '94', hip: '112', inseam: '80' } },
]

const COUPONS = [
  { code: 'WELCOME10', discountType: CouponDiscountType.PERCENT, value: 10, minSubtotal: 999, maxDiscount: 500 },
  { code: 'FLAT200', discountType: CouponDiscountType.FIXED, value: 200, minSubtotal: 1499, maxDiscount: null },
  { code: 'TRACKS15', discountType: CouponDiscountType.PERCENT, value: 15, minSubtotal: 1999, maxDiscount: 800 },
  { code: 'VIP25', discountType: CouponDiscountType.PERCENT, value: 25, minSubtotal: 2499, maxDiscount: 1500 },
  { code: 'SUMMER20', discountType: CouponDiscountType.PERCENT, value: 20, minSubtotal: 999, maxDiscount: 600 },
]

const DEMO_USERS = [
  { name: 'Demo Shopper', email: 'demo@desentclub.com', password: 'Demo@1234' },
  { name: 'Priya Sharma', email: 'priya@yopmail.com', password: 'Priya@1234' },
  { name: 'Rahul Mehta', email: 'rahul@yopmail.com', password: 'Rahul@1234' },
]

const audienceByIndex = (index) => {
  if (index % 3 === 0) return ProductAudience.MEN
  if (index % 3 === 1) return ProductAudience.WOMEN
  return ProductAudience.UNISEX
}

const img = (index) => IMAGE_POOL[index % IMAGE_POOL.length]

async function clearProductCatalog() {
  console.log('Clearing product catalog…')
  const deletedPayments = await prisma.payment.deleteMany({})
  console.log(`  Deleted ${deletedPayments.count} payments.`)
  const deletedOrderItems = await prisma.orderItem.deleteMany({})
  console.log(`  Deleted ${deletedOrderItems.count} order items.`)
  const deletedOrders = await prisma.order.deleteMany({})
  console.log(`  Deleted ${deletedOrders.count} orders.`)

  const deletedProducts = await prisma.product.deleteMany({})
  console.log(`  Deleted ${deletedProducts.count} products.`)

  const deletedSubs = await prisma.productCategorySubcategory.deleteMany({})
  console.log(`  Deleted ${deletedSubs.count} subcategories.`)
}

async function cleanupOrphanCategories(validSlugs) {
  const orphans = await prisma.productCategory.findMany({
    where: { slug: { notIn: validSlugs } },
    include: { _count: { select: { products: true } } },
  })
  for (const row of orphans) {
    if (row._count.products === 0) {
      await prisma.productCategory.update({
        where: { id: row.id },
        data: { isActive: false },
      })
      console.log(`  Deactivated orphan category: ${row.slug}`)
    }
  }
}

async function ensureCategory(def) {
  return prisma.productCategory.upsert({
    where: { slug: def.slug },
    update: { name: def.name, image: img(def.imageIndex), isActive: true },
    create: { name: def.name, slug: def.slug, image: img(def.imageIndex), isActive: true },
  })
}

async function ensureSubcategory(categoryId, sub, sortOrder) {
  return prisma.productCategorySubcategory.upsert({
    where: { categoryId_slug: { categoryId, slug: sub.slug } },
    update: { name: sub.name, sortOrder, isActive: true, image: img(sub.imageIndex) },
    create: {
      categoryId,
      name: sub.name,
      slug: sub.slug,
      sortOrder,
      isActive: true,
      image: img(sub.imageIndex),
    },
  })
}

async function ensureFabrics() {
  const map = new Map()
  for (const fabric of FABRICS) {
    const row = await prisma.fabric.upsert({
      where: { slug: fabric.slug },
      update: { name: fabric.name, sortOrder: fabric.sortOrder, isActive: true },
      create: { slug: fabric.slug, name: fabric.name, sortOrder: fabric.sortOrder, isActive: true },
    })
    map.set(fabric.slug, row)
  }
  return map
}

async function ensureMeasurementAttributes() {
  const map = new Map()
  for (const attribute of MEASUREMENT_ATTRIBUTES) {
    const row = await prisma.measurementAttribute.upsert({
      where: { slug: attribute.slug },
      update: { label: attribute.label, unit: attribute.unit, sortOrder: attribute.sortOrder, isActive: true },
      create: { slug: attribute.slug, label: attribute.label, unit: attribute.unit, sortOrder: attribute.sortOrder, isActive: true },
    })
    map.set(attribute.slug, row)
  }
  return map
}

async function ensureSizes(attributeMap) {
  const sizeMap = new Map()
  for (const row of SIZE_CHART) {
    const size = await prisma.size.upsert({
      where: { code: row.code },
      update: { name: row.name, sortOrder: row.sortOrder, valueUnit: 'cm', isActive: true },
      create: { code: row.code, name: row.name, sortOrder: row.sortOrder, valueUnit: 'cm', isActive: true },
    })
    sizeMap.set(row.code, size)
    for (const [slug, value] of Object.entries(row.measurements)) {
      const attribute = attributeMap.get(slug)
      if (!attribute) continue
      await prisma.sizeMeasurementValue.upsert({
        where: { sizeId_attributeId: { sizeId: size.id, attributeId: attribute.id } },
        update: { value },
        create: { sizeId: size.id, attributeId: attribute.id, value },
      })
    }
  }
  return sizeMap
}

async function createProduct(globalIndex, categoryDef, categoryId, subcategoryId, ctx) {
  const localIndex = globalIndex % categoryDef.productCount
  const baseName = categoryDef.names[localIndex % categoryDef.names.length]
  const productName = `${baseName} ${globalIndex + 1}`
  const colorA = COLOR_SET[globalIndex % COLOR_SET.length]
  const colorB = COLOR_SET[(globalIndex + 3) % COLOR_SET.length]
  const colorC = COLOR_SET[(globalIndex + 6) % COLOR_SET.length]
  const qty = [12 + (globalIndex % 20), 10 + (globalIndex % 18), 8 + (globalIndex % 15), 6 + (globalIndex % 12)]

  const product = await prisma.product.create({
    data: {
      name: productName,
      description: categoryDef.description,
      price: categoryDef.basePrice + (localIndex % 12) * 75,
      quantity: qty.reduce((a, b) => a + b, 0),
      audience: audienceByIndex(globalIndex),
      color: colorA,
      fabric: '',
      discountPercent: globalIndex % 5 === 0 ? 10 + (globalIndex % 4) * 5 : null,
      isAvailable: true,
      categoryId,
      subcategoryId,
    },
    select: { id: true, name: true },
  })

  const selectedAttrs = categoryDef.attrs.map((slug) => ctx.attributeMap.get(slug)).filter(Boolean)
  if (selectedAttrs.length > 0) {
    await prisma.productMeasurementAttribute.createMany({
      data: selectedAttrs.map((attribute, sortOrder) => ({
        productId: product.id,
        attributeId: attribute.id,
        sortOrder,
      })),
    })
  }

  const [fabricA, fabricB] = categoryDef.fabrics.map((slug) => ctx.fabricMap.get(slug)).filter(Boolean)
  if (fabricA && fabricB) {
    await prisma.productFabric.createMany({
      data: [
        { productId: product.id, fabricId: fabricA.id, percent: 80 },
        { productId: product.id, fabricId: fabricB.id, percent: 20 },
      ],
    })
  }

  const variantRows = [
    { size: 'S', color: colorA, quantity: qty[0], sizeId: ctx.sizeMap.get('S')?.id ?? null },
    { size: 'M', color: colorA, quantity: qty[1], sizeId: ctx.sizeMap.get('M')?.id ?? null },
    { size: 'L', color: colorB, quantity: qty[2], sizeId: ctx.sizeMap.get('L')?.id ?? null },
    { size: 'XL', color: colorC, quantity: qty[3], sizeId: ctx.sizeMap.get('XL')?.id ?? null },
  ]

  await prisma.productVariant.createMany({
    data: variantRows.map((row) => ({
      productId: product.id,
      size: row.size,
      color: row.color,
      quantity: row.quantity,
      sizeId: row.sizeId,
    })),
  })

  await prisma.productImage.createMany({
    data: [
      { productId: product.id, path: img(globalIndex), color: colorA, sortOrder: 0 },
      { productId: product.id, path: img(globalIndex + 1), color: colorA, sortOrder: 1 },
      { productId: product.id, path: img(globalIndex + 2), color: colorB, sortOrder: 2 },
      { productId: product.id, path: img(globalIndex + 3), color: colorB, sortOrder: 3 },
      { productId: product.id, path: img(globalIndex + 4), color: colorC, sortOrder: 4 },
    ],
  })

  return product
}

async function seedCoupons(categoryMap) {
  console.log('Seeding coupons…')
  const couponRows = []
  for (const c of COUPONS) {
    const row = await prisma.coupon.upsert({
      where: { code: c.code },
      update: {
        discountType: c.discountType,
        value: c.value,
        minSubtotal: c.minSubtotal,
        maxDiscount: c.maxDiscount,
        isActive: true,
        usageLimit: 1000,
        perUserLimit: 5,
      },
      create: {
        code: c.code,
        discountType: c.discountType,
        value: c.value,
        minSubtotal: c.minSubtotal,
        maxDiscount: c.maxDiscount,
        isActive: true,
        usageLimit: 1000,
        perUserLimit: 5,
      },
    })
    couponRows.push(row)
  }

  const tracksCat = categoryMap.get('tracks')
  if (tracksCat) {
    const tracksCoupon = couponRows.find((r) => r.code === 'TRACKS15')
    if (tracksCoupon) {
      await prisma.couponCategory.upsert({
        where: { couponId_categoryId: { couponId: tracksCoupon.id, categoryId: tracksCat.id } },
        update: {},
        create: { couponId: tracksCoupon.id, categoryId: tracksCat.id },
      })
    }
  }

  return couponRows
}

async function seedUserGroups(couponRows) {
  console.log('Seeding user groups…')
  const vipGroup = await prisma.userGroup.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: { name: 'VIP Shoppers', description: 'Premium members with exclusive discounts', isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'VIP Shoppers',
      description: 'Premium members with exclusive discounts',
      isActive: true,
    },
  })

  const newGroup = await prisma.userGroup.upsert({
    where: { id: '00000000-0000-4000-8000-000000000002' },
    update: { name: 'New Users', description: 'First-time shoppers welcome offers', isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'New Users',
      description: 'First-time shoppers welcome offers',
      isActive: true,
    },
  })

  const vipCoupon = couponRows.find((r) => r.code === 'VIP25')
  const welcomeCoupon = couponRows.find((r) => r.code === 'WELCOME10')

  if (vipCoupon) {
    await prisma.couponUserGroup.upsert({
      where: { couponId_userGroupId: { couponId: vipCoupon.id, userGroupId: vipGroup.id } },
      update: {},
      create: { couponId: vipCoupon.id, userGroupId: vipGroup.id },
    })
  }
  if (welcomeCoupon) {
    await prisma.couponUserGroup.upsert({
      where: { couponId_userGroupId: { couponId: welcomeCoupon.id, userGroupId: newGroup.id } },
      update: {},
      create: { couponId: welcomeCoupon.id, userGroupId: newGroup.id },
    })
  }

  return { vipGroup, newGroup }
}

async function seedDemoUsers(groups) {
  console.log('Seeding demo users…')
  const hashed = await bcrypt.hash('Demo@1234', 10)
  const created = []

  for (const u of DEMO_USERS) {
    const password = await bcrypt.hash(u.password, 10)
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, password, isVerified: true, role: 'USER', provider: 'EMAIL' },
      create: {
        name: u.name,
        email: u.email,
        password,
        isVerified: true,
        role: 'USER',
        provider: 'EMAIL',
        authProviders: { create: { provider: 'EMAIL', providerId: u.email } },
      },
    })
    created.push(user)

    const existingAddr = await prisma.userAddress.findFirst({ where: { userId: user.id } })
    if (!existingAddr) {
      await prisma.userAddress.create({
        data: {
          userId: user.id,
          fullName: u.name,
          phone: '9876543210',
          line1: '42 Fashion Street',
          line2: 'Near City Mall',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
          isDefault: true,
        },
      })
    }
  }

  const testUser = await prisma.user.findUnique({ where: { email: 'newuser06@yopmail.com' } })
  if (testUser) {
    await prisma.userGroupMember.upsert({
      where: { userGroupId_userId: { userGroupId: groups.newGroup.id, userId: testUser.id } },
      update: {},
      create: { userGroupId: groups.newGroup.id, userId: testUser.id },
    })
  }

  return created
}

async function run() {
  await clearProductCatalog()

  const fabricMap = await ensureFabrics()
  const attributeMap = await ensureMeasurementAttributes()
  const sizeMap = await ensureSizes(attributeMap)

  const categoryMap = new Map()
  const subcategoryPools = new Map()

  for (const def of CATALOG) {
    const category = await ensureCategory(def)
    categoryMap.set(def.slug, category)
    const subs = []
    for (let i = 0; i < def.subcategories.length; i += 1) {
      subs.push(await ensureSubcategory(category.id, def.subcategories[i], i + 1))
    }
    subcategoryPools.set(def.slug, subs)
    console.log(`  Category: ${def.name} (${def.subcategories.length} subcategories)`)
  }

  await cleanupOrphanCategories(CATALOG.map((c) => c.slug))

  console.log(`Seeding ${TARGET_PRODUCT_COUNT} products…`)
  let globalIndex = 0
  const productsPerCategory = TARGET_PRODUCT_COUNT / CATALOG.length

  for (const def of CATALOG) {
    const category = categoryMap.get(def.slug)
    const subs = subcategoryPools.get(def.slug)
    for (let i = 0; i < productsPerCategory; i += 1) {
      const sub = subs[i % subs.length]
      const created = await createProduct(globalIndex, def, category.id, sub.id, { fabricMap, attributeMap, sizeMap })
      globalIndex += 1
      if (globalIndex % 20 === 0 || globalIndex === TARGET_PRODUCT_COUNT) {
        console.log(`  ${globalIndex}/${TARGET_PRODUCT_COUNT} — ${created.name}`)
      }
    }
  }

  const couponRows = await seedCoupons(categoryMap)
  const groups = await seedUserGroups(couponRows)
  await seedDemoUsers(groups)

  const [productCount, subCount, variantCount, imageCount, catCount, couponCount] = await Promise.all([
    prisma.product.count(),
    prisma.productCategorySubcategory.count(),
    prisma.productVariant.count(),
    prisma.productImage.count(),
    prisma.productCategory.count({ where: { isActive: true } }),
    prisma.coupon.count({ where: { isActive: true } }),
  ])

  console.log('\nDone.')
  console.log(`  Active categories: ${catCount}`)
  console.log(`  Products:          ${productCount}`)
  console.log(`  Subcategories:     ${subCount}`)
  console.log(`  Variants:          ${variantCount}`)
  console.log(`  Images:            ${imageCount}`)
  console.log(`  Coupons:           ${couponCount}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
