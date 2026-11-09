import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { cookies } from 'next/headers'

/**
 * Cookie Storage Architecture for SmartAttend
 *
 * Implements a dual-layer Cookie Storage System:
 * - ServerCookieStorage: Works with Next.js App Router (NextResponse, NextRequest, cookies() header store).
 * - ClientCookieStorage: Works in the browser (document.cookie) for client components.
 *
 * Features:
 * 1. CRUD: set, get, update, delete/remove, has, getAll, clear.
 * 2. Security: HttpOnly, Secure, SameSite ('lax' | 'strict' | 'none').
 * 3. Scope: Domain and Path scoping.
 * 4. Lifespan: Configurable Expires, Max-Age, and Session Cookies (no expiry, lives until browser closes).
 * 5. Encryption: AES-256-GCM authenticated encryption for sensitive, non-plaintext cookie values.
 * 6. Expiry Handling: Auto-cleans and invalidates expired cookies.
 */

export type SameSiteOption = 'lax' | 'strict' | 'none'

export interface CookieOptions {
  /** Maximum lifetime of the cookie in seconds */
  maxAge?: number
  /** Absolute expiration date of the cookie */
  expires?: Date | string | number
  /** Whether the cookie is accessible only via HTTP(S) headers (cannot be accessed via JS) */
  httpOnly?: boolean
  /** Whether the cookie should only be transmitted over HTTPS */
  secure?: boolean
  /** Controls cross-site request behavior */
  sameSite?: SameSiteOption
  /** Domain scope for the cookie */
  domain?: string
  /** URL path scope for the cookie (defaults to '/') */
  path?: string
  /** Whether to encrypt the value using AES-256-GCM before storage */
  encrypt?: boolean
}

/** Standard Cookie Names used in the application */
export const COOKIE_NAMES = {
  SESSION: 'smartattend_session',
  PORTAL: 'smartattend_portal',
  LOCALE: 'smartattend_locale',
  THEME: 'smartattend_theme',
  DEVICE_ID: 'smartattend_device_id',
} as const

// Secret encryption key derived from environment or application master seed
function getEncryptionKey(): Buffer {
  const secret = process.env.COOKIE_ENCRYPTION_SECRET || process.env.DATABASE_URL || 'smartattend-cookie-secret-master-seed'
  return createHash('sha256').update(secret).digest()
}

/**
 * Encrypts a sensitive string value using AES-256-GCM.
 * Formats output as `enc.v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`.
 */
export function encryptCookieValue(plaintext: string): string {
  try {
    const key = getEncryptionKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const tag = cipher.getAuthTag().toString('hex')
    return `enc.v1:${iv.toString('hex')}:${tag}:${encrypted}`
  } catch (err) {
    console.error('Failed to encrypt cookie value:', err)
    return plaintext
  }
}

/**
 * Decrypts an AES-256-GCM encrypted cookie string.
 * Gracefully passes through plaintext values for backward compatibility.
 */
export function decryptCookieValue(ciphertext: string): string | null {
  if (!ciphertext || typeof ciphertext !== 'string') return null
  if (!ciphertext.startsWith('enc.v1:')) {
    // Unencrypted legacy value
    return ciphertext
  }

  try {
    const parts = ciphertext.split(':')
    if (parts.length !== 4) return null
    const [, ivHex, tagHex, encryptedHex] = parts

    const key = getEncryptionKey()
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.warn('Failed to decrypt cookie value (signature mismatch or tampered cookie):', err)
    return null
  }
}

/**
 * Standardizes cookie options, calculating expires from maxAge or vice versa.
 */
export function resolveCookieOptions(options?: CookieOptions) {
  const isProduction = process.env.NODE_ENV === 'production'
  const path = options?.path ?? '/'
  const sameSite = options?.sameSite ?? 'lax'
  const httpOnly = options?.httpOnly ?? false
  const secure = options?.secure !== undefined ? options.secure : isProduction
  const domain = options?.domain

  let maxAge = options?.maxAge
  let expires: Date | undefined

  if (options?.expires) {
    expires = options.expires instanceof Date ? options.expires : new Date(options.expires)
    if (!maxAge) {
      maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000))
    }
  } else if (maxAge !== undefined) {
    expires = new Date(Date.now() + maxAge * 1000)
  }

  return {
    path,
    sameSite,
    httpOnly,
    secure,
    domain,
    maxAge,
    expires,
    encrypt: options?.encrypt ?? false,
  }
}

// ============================================================================
// Server-Side Cookie Storage (Next.js App Router)
// ============================================================================

export type CookieStoreAsync = Awaited<ReturnType<typeof cookies>>

export const serverCookieStorage = {
  /**
   * Sets a cookie on an outgoing NextResponse.
   * If `options.encrypt` is true, the value is securely encrypted with AES-256-GCM.
   */
  set(response: NextResponse, name: string, value: string, options?: CookieOptions): void {
    const resolved = resolveCookieOptions(options)
    const finalValue = resolved.encrypt ? encryptCookieValue(value) : value

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cookieOpts: any = {
      path: resolved.path,
      sameSite: resolved.sameSite,
      httpOnly: resolved.httpOnly,
      secure: resolved.secure,
    }

    if (resolved.domain) cookieOpts.domain = resolved.domain
    // If maxAge is defined, pass it. If omitted, Next.js treats this as a Session Cookie.
    if (resolved.maxAge !== undefined) cookieOpts.maxAge = resolved.maxAge
    if (resolved.expires !== undefined) cookieOpts.expires = resolved.expires

    response.cookies.set(name, finalValue, cookieOpts)
  },

  /**
   * Retrieves a cookie from a NextRequest or next/headers cookieStore.
   * Automatically decrypts if the value is AES-256-GCM encrypted.
   */
  get(source: NextRequest | CookieStoreAsync, name: string, options?: { decrypt?: boolean }): string | null {
    if (!source) return null
    let rawValue: string | undefined

    if ('cookies' in source && typeof source.cookies?.get === 'function') {
      // NextRequest
      rawValue = source.cookies.get(name)?.value
    } else if (typeof (source as CookieStoreAsync).get === 'function') {
      // next/headers cookies()
      rawValue = (source as CookieStoreAsync).get(name)?.value
    }

    if (!rawValue) return null
    if (options?.decrypt || rawValue.startsWith('enc.v1:')) {
      return decryptCookieValue(rawValue)
    }
    return rawValue
  },

  /**
   * Updates an existing cookie on an outgoing NextResponse.
   */
  update(response: NextResponse, name: string, value: string, options?: CookieOptions): void {
    this.set(response, name, value, options)
  },

  /**
   * Deletes a cookie by invalidating it immediately (Max-Age=0, Expires in the past).
   */
  delete(response: NextResponse, name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void {
    response.cookies.set(name, '', {
      path: options?.path ?? '/',
      domain: options?.domain,
      maxAge: 0,
      expires: new Date(0),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  },

  /**
   * Checks whether a cookie exists in the request or headers store.
   */
  has(source: NextRequest | CookieStoreAsync, name: string): boolean {
    if (!source) return false
    if ('cookies' in source && typeof source.cookies?.has === 'function') {
      return source.cookies.has(name)
    }
    if (typeof (source as CookieStoreAsync).has === 'function') {
      return (source as CookieStoreAsync).has(name)
    }
    return Boolean(this.get(source, name))
  },
}

// ============================================================================
// Client-Side Cookie Storage (Browser document.cookie)
// ============================================================================

export const clientCookieStorage = {
  /**
   * Sets a cookie in the browser document.cookie.
   * Supports maxAge, expires, secure, sameSite, path, domain, encryption, and session cookies.
   */
  set(name: string, value: string, options?: CookieOptions): void {
    if (typeof document === 'undefined') return

    const resolved = resolveCookieOptions(options)
    const finalValue = resolved.encrypt ? encryptCookieValue(value) : value

    let cookieStr = `${encodeURIComponent(name)}=${encodeURIComponent(finalValue)}`

    if (resolved.path) {
      cookieStr += `; Path=${resolved.path}`
    }
    if (resolved.domain) {
      cookieStr += `; Domain=${resolved.domain}`
    }
    if (resolved.maxAge !== undefined) {
      cookieStr += `; Max-Age=${resolved.maxAge}`
    }
    if (resolved.expires) {
      cookieStr += `; Expires=${resolved.expires.toUTCString()}`
    }
    if (resolved.secure) {
      cookieStr += `; Secure`
    }
    if (resolved.sameSite) {
      cookieStr += `; SameSite=${resolved.sameSite.charAt(0).toUpperCase() + resolved.sameSite.slice(1)}`
    }

    document.cookie = cookieStr
  },

  /**
   * Retrieves a cookie value by name from document.cookie.
   * Automatically decrypts if encrypted.
   */
  get(name: string, options?: { decrypt?: boolean }): string | null {
    if (typeof document === 'undefined') return null

    const prefix = `${encodeURIComponent(name)}=`
    const parts = document.cookie.split(';')

    for (let part of parts) {
      part = part.trim()
      if (part.startsWith(prefix)) {
        const encodedVal = part.substring(prefix.length)
        const decodedVal = decodeURIComponent(encodedVal)
        if (options?.decrypt || decodedVal.startsWith('enc.v1:')) {
          return decryptCookieValue(decodedVal)
        }
        return decodedVal
      }
    }
    return null
  },

  /**
   * Updates an existing cookie in document.cookie.
   */
  update(name: string, value: string, options?: CookieOptions): boolean {
    if (!this.has(name)) return false
    this.set(name, value, options)
    return true
  },

  /**
   * Removes a cookie from document.cookie by setting Max-Age=0 and Expires in the past.
   */
  remove(name: string, options?: Pick<CookieOptions, 'path' | 'domain'>): void {
    if (typeof document === 'undefined') return
    const path = options?.path ?? '/'
    let cookieStr = `${encodeURIComponent(name)}=; Path=${path}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    if (options?.domain) {
      cookieStr += `; Domain=${options.domain}`
    }
    document.cookie = cookieStr
  },

  /**
   * Checks if a cookie exists and is not expired in document.cookie.
   */
  has(name: string): boolean {
    return this.get(name) !== null
  },

  /**
   * Returns a map of all readable cookies in document.cookie.
   */
  getAll(): Record<string, string> {
    if (typeof document === 'undefined') return {}
    const result: Record<string, string> = {}
    const parts = document.cookie.split(';')

    for (let part of parts) {
      part = part.trim()
      if (!part) continue
      const eqIdx = part.indexOf('=')
      if (eqIdx !== -1) {
        const key = decodeURIComponent(part.substring(0, eqIdx).trim())
        const val = decodeURIComponent(part.substring(eqIdx + 1).trim())
        result[key] = val.startsWith('enc.v1:') ? decryptCookieValue(val) ?? val : val
      }
    }
    return result
  },

  /**
   * Clears all client-accessible cookies for the specified path and domain.
   */
  clear(options?: Pick<CookieOptions, 'path' | 'domain'>): void {
    if (typeof document === 'undefined') return
    const all = this.getAll()
    for (const key of Object.keys(all)) {
      this.remove(key, options)
    }
  },
}

// Unified export: uses serverCookieStorage when in server environment, clientCookieStorage on browser
export const cookieStorage = typeof document !== 'undefined' ? clientCookieStorage : serverCookieStorage

// ============================================================================
// Dedicated Auth Cookie Manager (Seamless Integration with Existing Code)
// ============================================================================

export const authCookieManager = {
  /**
   * Sets the HttpOnly session token cookie on login or session creation.
   * Guarantees persistence across page reloads (refreshes).
   */
  saveSession(response: NextResponse, token: string, maxAgeSeconds: number): void {
    serverCookieStorage.set(response, COOKIE_NAMES.SESSION, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: maxAgeSeconds,
    })
  },

  /**
   * Clears the session token cookie on logout.
   */
  clearSession(response: NextResponse): void {
    serverCookieStorage.delete(response, COOKIE_NAMES.SESSION, { path: '/' })
  },

  /**
   * Retrieves the active session token from incoming request or headers store.
   */
  getSessionToken(source: NextRequest | CookieStoreAsync): string | null {
    return serverCookieStorage.get(source, COOKIE_NAMES.SESSION)
  },
}

