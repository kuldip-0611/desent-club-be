import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import type { FileFilterCallback } from 'multer';
import { extname, join } from 'path';
import { IMAGE_MIME_REGEX, UPLOAD_LIMITS } from '../common/upload-settings';

export const PROFILE_UPLOAD_SUBDIR = 'profiles';

export function ensureProfileUploadDir(): string {
  const dir = join(process.cwd(), 'uploads', PROFILE_UPLOAD_SUBDIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const profileImageMulterOptions = {
  storage: diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, ensureProfileUploadDir());
    },
    filename: (_req, file, cb) => {
      cb(
        null,
        `${randomUUID()}${extname(file.originalname).toLowerCase() || '.jpg'}`,
      );
    },
  }),
  limits: { fileSize: UPLOAD_LIMITS.profileImageBytes },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    if (!IMAGE_MIME_REGEX.test(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
};
