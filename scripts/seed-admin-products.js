/* eslint-disable no-console */
const { PrismaClient, ProductAudience } = require('@prisma/client')
const { randomUUID } = require('crypto')

const prisma = new PrismaClient()

const COLOR_SET = ['Black', 'White', 'Navy', 'Charcoal', 'Olive', 'Maroon', 'Sky Blue', 'Beige', 'Lavender', 'Mint']

const IMAGE_POOL = [
  'https://images.pexels.com/photos/9558761/pexels-photo-9558761.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/7679720/pexels-photo-7679720.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311606/pexels-photo-6311606.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/428340/pexels-photo-428340.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311644/pexels-photo-6311644.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311598/pexels-photo-6311598.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/6311640/pexels-photo-6311640.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'https://images.pexels.com/photos/8173478/pexels-photo-8173478.jpeg?auto=compress&cs=tinysrgb&w=1200',
]

const TSHIRT_NAMES = [
  'Classic Crew Tshirt',
  'Oversized Street Tshirt',
  'Athletic Dry Fit Tshirt',
  'Vintage Wash Tshirt',
  'Logo Essential Tshirt',
]

const TRACK_NAMES = [
  'Performance Track Pants',
  'Relaxed Jogger Tracks',
  'Training Core Tracks',
  'Zip Pocket Tracks',
  'Everyday Comfort Tracks',
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
  {
    code: 'S',
    name: 'Small',
    sortOrder: 1,
    measurements: { chest: '96', shoulder: '42', length: '68', waist: '76', hip: '94', inseam: '74' },
  },
  {
    code: 'M',
    name: 'Medium',
    sortOrder: 2,
    measurements: { chest: '102', shoulder: '44', length: '70', waist: '82', hip: '100', inseam: '76' },
  },
  {
    code: 'L',
    name: 'Large',
    sortOrder: 3,
    measurements: { chest: '108', shoulder: '46', length: '72', waist: '88', hip: '106', inseam: '78' },
  },
  {
    code: 'XL',
    name: 'Extra Large',
    sortOrder: 4,
    measurements: { chest: '114', shoulder: '48', length: '74', waist: '94', hip: '112', inseam: '80' },
  },
]

const audienceByIndex = (index) => {
  if (index % 3 === 0) return ProductAudience.MEN
  if (index % 3 === 1) return ProductAudience.WOMEN
  return ProductAudience.UNISEX
}

async function ensureCategory(name, slug, image) {
  const existing = await prisma.productCategory.findUnique({ where: { slug } })
  if (existing) return existing
  return prisma.productCategory.create({
    data: {
      name,
      slug,
      image,
      isActive: true,
    },
  })
}

async function ensureFabrics() {
  const map = new Map()
  for (const fabric of FABRICS) {
    const row = await prisma.fabric.upsert({
      where: { slug: fabric.slug },
      update: { name: fabric.name, sortOrder: fabric.sortOrder, isActive: true },
      create: {
        slug: fabric.slug,
        name: fabric.name,
        sortOrder: fabric.sortOrder,
        isActive: true,
      },
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
      update: {
        label: attribute.label,
        unit: attribute.unit,
        sortOrder: attribute.sortOrder,
        isActive: true,
      },
      create: {
        slug: attribute.slug,
        label: attribute.label,
        unit: attribute.unit,
        sortOrder: attribute.sortOrder,
        isActive: true,
      },
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
      update: {
        name: row.name,
        sortOrder: row.sortOrder,
        valueUnit: 'cm',
        isActive: true,
      },
      create: {
        code: row.code,
        name: row.name,
        sortOrder: row.sortOrder,
        valueUnit: 'cm',
        isActive: true,
      },
    })
    sizeMap.set(row.code, size)

    for (const [slug, value] of Object.entries(row.measurements)) {
      const attribute = attributeMap.get(slug)
      if (!attribute) continue
      await prisma.sizeMeasurementValue.upsert({
        where: {
          sizeId_attributeId: {
            sizeId: size.id,
            attributeId: attribute.id,
          },
        },
        update: { value },
        create: {
          sizeId: size.id,
          attributeId: attribute.id,
          value,
        },
      })
    }
  }
  return sizeMap
}

async function createProduct(index, categoryId, categoryType, ctx) {
  const names = categoryType === 'tshirts' ? TSHIRT_NAMES : TRACK_NAMES
  const baseName = names[index % names.length]
  const productName = `${baseName} ${index + 1}`
  const colorA = COLOR_SET[index % COLOR_SET.length]
  const colorB = COLOR_SET[(index + 2) % COLOR_SET.length]
  const quantityA = 8 + (index % 25)
  const quantityB = 6 + (index % 22)
  const quantityC = 5 + (index % 18)
  const totalQuantity = quantityA + quantityB + quantityC

  const product = await prisma.product.create({
    data: {
      name: productName,
      description:
        categoryType === 'tshirts'
          ? 'Premium cotton-rich t-shirt built for comfort, movement, and daily wear.'
          : 'Performance tracks made for training sessions and relaxed everyday styling.',
      price: 999 + (index % 15) * 90,
      quantity: totalQuantity,
      audience: audienceByIndex(index),
      color: colorA,
      fabric: '',
      discountPercent: index % 4 === 0 ? 10 + (index % 3) * 5 : null,
      isAvailable: true,
      categoryId,
      images: {
        create: [
          { path: IMAGE_POOL[index % IMAGE_POOL.length], sortOrder: 0 },
          { path: IMAGE_POOL[(index + 1) % IMAGE_POOL.length], sortOrder: 1 },
        ],
      },
    },
    select: { id: true, name: true },
  })

  const isTshirt = categoryType === 'tshirts'
  const selectedAttrSlugs = isTshirt ? ['chest', 'shoulder', 'length'] : ['waist', 'hip', 'inseam']
  const selectedAttrs = selectedAttrSlugs.map((slug) => ctx.attributeMap.get(slug)).filter(Boolean)
  if (selectedAttrs.length > 0) {
    await prisma.productMeasurementAttribute.createMany({
      data: selectedAttrs.map((attribute, sortOrder) => ({
        productId: product.id,
        attributeId: attribute.id,
        sortOrder,
      })),
    })
  }

  const fabricPrimary = isTshirt ? ctx.fabricMap.get('cotton') : ctx.fabricMap.get('polyester')
  const fabricSecondary = isTshirt ? ctx.fabricMap.get('spandex') : ctx.fabricMap.get('elastane')
  if (fabricPrimary && fabricSecondary) {
    await prisma.productFabric.createMany({
      data: [
        { productId: product.id, fabricId: fabricPrimary.id, percent: 80 },
        { productId: product.id, fabricId: fabricSecondary.id, percent: 20 },
      ],
    })
  }

  const variantRows = [
    { size: 'M', color: colorA, quantity: quantityA, sizeId: ctx.sizeMap.get('M')?.id ?? null },
    { size: 'L', color: colorA, quantity: quantityB, sizeId: ctx.sizeMap.get('L')?.id ?? null },
    { size: 'XL', color: colorB, quantity: quantityC, sizeId: ctx.sizeMap.get('XL')?.id ?? null },
  ]
  for (let variantIndex = 0; variantIndex < variantRows.length; variantIndex += 1) {
    const row = variantRows[variantIndex]
    const sku = `${product.id.replace(/-/g, '').slice(0, 8)}-${row.size}-${index + variantIndex}`.toUpperCase()
    await prisma.$executeRawUnsafe(
      'INSERT INTO ProductVariant (id, productId, size, color, stock, sku, sizeId, quantity, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      randomUUID(),
      product.id,
      row.size,
      row.color,
      row.quantity,
      sku,
      row.sizeId,
      row.quantity,
    )
  }

  await prisma.productImage.createMany({
    data: [
      { productId: product.id, path: IMAGE_POOL[index % IMAGE_POOL.length], color: colorA, sortOrder: 0 },
      { productId: product.id, path: IMAGE_POOL[(index + 1) % IMAGE_POOL.length], color: colorA, sortOrder: 1 },
      { productId: product.id, path: IMAGE_POOL[(index + 2) % IMAGE_POOL.length], color: colorB, sortOrder: 2 },
      { productId: product.id, path: IMAGE_POOL[(index + 3) % IMAGE_POOL.length], color: colorB, sortOrder: 3 },
    ],
  })

  return product
}

async function run() {
  const tshirtCategory = await ensureCategory(
    'Tshirt',
    'tshirt',
    IMAGE_POOL[0],
  )
  const tracksCategory = await ensureCategory(
    'Tracks',
    'tracks',
    IMAGE_POOL[1],
  )
  const fabricMap = await ensureFabrics()
  const attributeMap = await ensureMeasurementAttributes()
  const sizeMap = await ensureSizes(attributeMap)

  const targetCount = 100

  console.log('Resetting product catalog...')
  await prisma.product.deleteMany({})

  for (let index = 0; index < targetCount; index += 1) {
    const isTshirt = index % 2 === 0
    const categoryId = isTshirt ? tshirtCategory.id : tracksCategory.id
    const categoryType = isTshirt ? 'tshirts' : 'tracks'
    const created = await createProduct(index, categoryId, categoryType, {
      fabricMap,
      attributeMap,
      sizeMap,
    })
    console.log(`Created ${created.name} (${created.id})`)
  }

  const finalCount = await prisma.product.count()
  console.log(`Done. Total products: ${finalCount}`)
}

run()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
