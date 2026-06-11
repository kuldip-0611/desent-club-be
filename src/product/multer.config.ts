/**
 * Re-exports the shared memory-storage multer options for product images.
 * Files are buffered in RAM and streamed directly to S3 — nothing is written
 * to disk. The PRODUCTS_UPLOAD_SUBDIR constant is kept for backward compat
 * (used as the S3 folder name).
 */
export { productImageMulterOptions } from '../common/memory-multer.config';

export const PRODUCTS_UPLOAD_SUBDIR = 'products' as const;
