/**
 * Re-exports the shared memory-storage multer options for category / subcategory images.
 * Files are buffered in RAM and streamed directly to S3 — nothing is written to disk.
 */
export {
  categoryImageMulterOptions,
  subcategoryImageMulterOptions,
} from '../common/memory-multer.config';

// Kept for any legacy references
export const CATEGORY_UPLOAD_SUBDIR = 'categories' as const;
export const SUBCATEGORY_UPLOAD_SUBDIR = 'subcategories' as const;
