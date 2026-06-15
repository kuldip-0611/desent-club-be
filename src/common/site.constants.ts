const SITE_URLS = {
  dev: 'https://dev.disentclub.com',
  prod: 'https://disentclub.com',
  local: 'http://localhost:3000',
} as const

type AppEnv = keyof typeof SITE_URLS

const parseAppEnv = (): AppEnv => {
  const raw =
    process.env.APP_ENV?.trim().toLowerCase() ??
    process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase()
  if (raw === 'dev' || raw === 'development') return 'dev'
  if (raw === 'prod' || raw === 'production' || raw === 'live') return 'prod'
  if (process.env.NODE_ENV === 'production') return 'prod'
  return 'local'
}

export const resolveSiteUrl = (value?: string | null): string => {
  const explicit = value?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  return SITE_URLS[parseAppEnv()]
}
