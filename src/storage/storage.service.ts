/**
 * StorageService — wraps AWS S3 for all file uploads.
 *
 * Credential strategy (dev vs prod):
 *   NODE_ENV=production  →  AWS_ACCESS_KEY_ID_PROD  /  AWS_SECRET_ACCESS_KEY_PROD  /  AWS_S3_BUCKET_PROD
 *   everything else      →  AWS_ACCESS_KEY_ID_DEV   /  AWS_SECRET_ACCESS_KEY_DEV   /  AWS_S3_BUCKET_DEV
 *
 * Optional CDN: set AWS_S3_CDN_URL (e.g. https://cdn.disentclub.com) to serve
 * images through CloudFront instead of direct S3 URLs.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';

export type StorageFolder = 'products' | 'banners' | 'categories' | 'subcategories' | 'misc';

export interface UploadResult {
  /** Full public URL (CDN or S3) */
  url: string;
  /** S3 object key, store this to delete later */
  key: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cdnUrl: string | null;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    const isProd = config.get<string>('NODE_ENV') === 'production';

    const accessKeyId = isProd
      ? (config.get<string>('AWS_ACCESS_KEY_ID_PROD') ?? config.get<string>('AWS_ACCESS_KEY_ID') ?? '')
      : (config.get<string>('AWS_ACCESS_KEY_ID_DEV') ?? config.get<string>('AWS_ACCESS_KEY_ID') ?? '');

    const secretAccessKey = isProd
      ? (config.get<string>('AWS_SECRET_ACCESS_KEY_PROD') ?? config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '')
      : (config.get<string>('AWS_SECRET_ACCESS_KEY_DEV') ?? config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '');

    this.bucket = isProd
      ? (config.get<string>('AWS_S3_BUCKET_PROD') ?? config.get<string>('AWS_S3_BUCKET') ?? '')
      : (config.get<string>('AWS_S3_BUCKET_DEV') ?? config.get<string>('AWS_S3_BUCKET') ?? '');

    this.region = config.get<string>('AWS_S3_REGION') ?? 'ap-south-1';
    this.cdnUrl = config.get<string>('AWS_S3_CDN_URL') ?? null;

    this.client = new S3Client({
      region: this.region,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.log(
      `S3 initialised — env=${isProd ? 'prod' : 'dev'} bucket=${this.bucket} region=${this.region}`,
    );
  }

  // ── Upload ────────────────────────────────────────────────────────────────────

  /**
   * Upload a file buffer to S3.
   * @param file  Express.Multer.File (memoryStorage — buffer must be populated)
   * @param folder  Logical subfolder inside the bucket (e.g. 'products')
   */
  async upload(file: Express.Multer.File, folder: StorageFolder): Promise<UploadResult> {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${folder}/${randomUUID()}${ext}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Public read is granted via bucket policy, not ACL (AWS default since 2023)
      }),
    );

    const url = this.buildUrl(key);
    this.logger.debug(`Uploaded s3://${this.bucket}/${key}`);
    return { url, key };
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  /**
   * Delete an object from S3.
   * Accepts either a full URL or a raw S3 key.
   * Silently ignores missing objects.
   */
  async delete(urlOrKey: string): Promise<void> {
    if (!urlOrKey) return;
    const key = this.extractKey(urlOrKey);
    if (!key) return;

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.debug(`Deleted s3://${this.bucket}/${key}`);
    } catch (err: unknown) {
      // NoSuchKey is fine — object already gone
      const code = (err as { Code?: string; name?: string })?.Code ?? (err as { name?: string })?.name;
      if (code !== 'NoSuchKey') {
        this.logger.warn(`S3 delete failed for key "${key}": ${(err as Error)?.message}`);
      }
    }
  }

  // ── Exists ────────────────────────────────────────────────────────────────────

  async exists(urlOrKey: string): Promise<boolean> {
    const key = this.extractKey(urlOrKey);
    if (!key) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Build the public URL for a key — uses CDN URL if configured. */
  buildUrl(key: string): string {
    if (this.cdnUrl) return `${this.cdnUrl.replace(/\/$/, '')}/${key}`;
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Extract the S3 key from a URL or return it as-is if it already looks like a key.
   * Handles:
   *   https://bucket.s3.region.amazonaws.com/products/uuid.jpg  →  products/uuid.jpg
   *   https://cdn.disentclub.com/products/uuid.jpg               →  products/uuid.jpg
   *   products/uuid.jpg                                           →  products/uuid.jpg
   */
  extractKey(urlOrKey: string): string {
    if (!urlOrKey) return '';

    // Already a bare key (no protocol)
    if (!urlOrKey.startsWith('http')) return urlOrKey;

    try {
      const u = new URL(urlOrKey);
      // pathname starts with '/', strip it
      return u.pathname.replace(/^\//, '');
    } catch {
      return urlOrKey;
    }
  }

  /** Returns true if the given string looks like an S3/CDN URL we manage. */
  isManagedUrl(url: string): boolean {
    if (!url) return false;
    if (this.cdnUrl && url.startsWith(this.cdnUrl)) return true;
    return (
      url.includes(`${this.bucket}.s3.`) ||
      url.includes(`s3.amazonaws.com/${this.bucket}`)
    );
  }

  get bucketName(): string { return this.bucket; }
}
