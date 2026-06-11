/**
 * Shared multer options that use in-memory storage.
 * Files are kept in req.file.buffer and streamed directly to S3 — nothing is
 * written to the local filesystem.
 */
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import type { FileFilterCallback } from 'multer';
import { IMAGE_MIME_REGEX, UPLOAD_LIMITS } from './upload-settings';

const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  if (!IMAGE_MIME_REGEX.test(file.mimetype)) {
    cb(new Error('Only JPEG, PNG, GIF, or WebP images are allowed'));
    return;
  }
  cb(null, true);
};

export const productImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.productImageBytes },
  fileFilter: imageFileFilter,
};

export const categoryImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.categoryImageBytes },
  fileFilter: imageFileFilter,
};

export const subcategoryImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.categoryImageBytes },
  fileFilter: imageFileFilter,
};

export const bannerImageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: UPLOAD_LIMITS.productImageBytes },
  fileFilter: imageFileFilter,
};
