export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const;

export const UPLOAD_LIMITS = {
  productImageBytes: 1 * 1024 * 1024,
  categoryImageBytes: 2 * 1024 * 1024,
  profileImageBytes: 2 * 1024 * 1024,
} as const;

export const UPLOAD_SETTINGS_RESPONSE = {
  image: {
    mimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
    extensions: [...ALLOWED_IMAGE_EXTENSIONS],
  },
  limits: {
    productImageMaxBytes: UPLOAD_LIMITS.productImageBytes,
    categoryImageMaxBytes: UPLOAD_LIMITS.categoryImageBytes,
    profileImageMaxBytes: UPLOAD_LIMITS.profileImageBytes,
  },
} as const;

export const IMAGE_MIME_REGEX = /^image\/(jpeg|jpg|png|gif|webp)$/i;
