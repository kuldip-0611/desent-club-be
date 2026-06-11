export const DEFAULT_SUPPORT_EMAIL = 'support@desentclub.com'
export const DEFAULT_SUPPORT_PHONE = '919313597171'
export const DEFAULT_SUPPORT_PHONE_DISPLAY = '+91 93135 97171'

export const resolveSupportEmail = (value?: string | null): string =>
  value?.trim() || DEFAULT_SUPPORT_EMAIL

export const resolveSupportPhone = (value?: string | null): string =>
  value?.trim() || DEFAULT_SUPPORT_PHONE

export const resolveSupportPhoneDisplay = (value?: string | null): string =>
  value?.trim() || DEFAULT_SUPPORT_PHONE_DISPLAY
