import {
  COOKIE_NAMES,
  resolveCookieOptions,
  serverCookieStorage,
  clientCookieStorage,
  cookieStorage,
  authCookieManager,
  type CookieOptions,
  type SameSiteOption,
} from '@/lib/storage/cookie-storage'

export const SESSION_COOKIE = COOKIE_NAMES.SESSION

export function sessionCookieOptions(maxAgeSeconds: number) {
  const resolved = resolveCookieOptions({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  })

  return {
    httpOnly: resolved.httpOnly,
    secure: resolved.secure,
    sameSite: resolved.sameSite,
    path: resolved.path,
    maxAge: resolved.maxAge,
  }
}

export {
  COOKIE_NAMES,
  serverCookieStorage,
  clientCookieStorage,
  cookieStorage,
  authCookieManager,
  type CookieOptions,
  type SameSiteOption,
}
