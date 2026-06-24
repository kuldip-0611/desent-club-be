/**
 * migrate-images-to-s3.ts
 * Downloads all Unsplash images from DB and re-uploads them to S3,
 * then updates the DB records with the new S3 URLs.
 *
 * Run:  npx ts-node -r tsconfig-paths/register scripts/migrate-images-to-s3.ts
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { PrismaClient } from '@prisma/client'
import * as https from 'https'
import * as http from 'http'
import { createHash } from 'crypto'
import * as path from 'path'

const prisma = new PrismaClient()

const BUCKET = process.env.AWS_S3_BUCKET_DEV!
const REGION = process.env.AWS_S3_REGION ?? 'ap-southeast-2'
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID_DEV!
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY_DEV!

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
})

function s3PublicUrl(key: string) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 DisentClub/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject)
      }
      if (!res.statusCode || res.statusCode >= 400) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function contentTypeFromUrl(url: string): string {
  const ext = path.extname(url.split('?')[0]).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'image/jpeg'
}

async function uploadToS3(folder: string, originalUrl: string): Promise<string> {
  const buf = await fetchBuffer(originalUrl)
  const hash = createHash('md5').update(originalUrl).digest('hex').slice(0, 12)
  const key = `${folder}/${hash}.jpg`

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buf,
    ContentType: contentTypeFromUrl(originalUrl),
    CacheControl: 'public, max-age=31536000, immutable',
  }))

  return s3PublicUrl(key)
}

async function main() {
  console.log(`Bucket: ${BUCKET}  Region: ${REGION}`)

  // ── 1. Product images ─────────────────────────────────────────────────────
  const productImages = await prisma.productImage.findMany({
    where: { path: { contains: 'unsplash' } },
  })
  console.log(`\nProduct images to migrate: ${productImages.length}`)

  let ok = 0; let fail = 0
  for (const [i, img] of productImages.entries()) {
    try {
      const newUrl = await uploadToS3('products', img.path)
      await prisma.productImage.update({
        where: { id: img.id },
        data: { path: newUrl },
      })
      ok++
      if ((i + 1) % 20 === 0 || i === productImages.length - 1) {
        console.log(`  [${i + 1}/${productImages.length}] ✓ ${ok} ok, ${fail} fail`)
      }
    } catch (e) {
      fail++
      console.error(`  FAIL ${img.path}: ${(e as Error).message}`)
    }
  }
  console.log(`Product images done — ${ok} migrated, ${fail} failed`)

  // ── 2. Category images ────────────────────────────────────────────────────
  const categories = await prisma.productCategory.findMany({
    where: { image: { contains: 'unsplash' } },
  })
  console.log(`\nCategory images to migrate: ${categories.length}`)

  for (const cat of categories) {
    if (!cat.image) continue
    try {
      const newUrl = await uploadToS3('categories', cat.image)
      await prisma.productCategory.update({ where: { id: cat.id }, data: { image: newUrl } })
      console.log(`  ✓ Category "${cat.name}"`)
    } catch (e) {
      console.error(`  FAIL category "${cat.name}": ${(e as Error).message}`)
    }
  }

  // ── 3. Subcategory images ─────────────────────────────────────────────────
  const subcats = await prisma.productCategorySubcategory.findMany({
    where: { image: { contains: 'unsplash' } },
  })
  console.log(`\nSubcategory images to migrate: ${subcats.length}`)

  for (const sub of subcats) {
    if (!sub.image) continue
    try {
      const newUrl = await uploadToS3('categories', sub.image)
      await prisma.productCategorySubcategory.update({ where: { id: sub.id }, data: { image: newUrl } })
      console.log(`  ✓ Subcategory "${sub.name}"`)
    } catch (e) {
      console.error(`  FAIL subcategory "${sub.name}": ${(e as Error).message}`)
    }
  }

  console.log('\n✅ Migration complete')
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
