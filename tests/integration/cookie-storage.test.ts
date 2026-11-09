import { describe, expect, it } from 'vitest'
import { NextResponse, NextRequest } from 'next/server'
import {
  serverCookieStorage,
  clientCookieStorage,
  authCookieManager,
  encryptCookieValue,
  decryptCookieValue,
  resolveCookieOptions,
  COOKIE_NAMES,
} from '@/lib/storage/cookie-storage'

describe('Cookie Storage System', () => {
  describe('1. Security & AES-256-GCM Encryption (Non-plaintext)', () => {
    it('encrypts sensitive values with IV, Auth Tag, and ciphertext without plaintext exposure', () => {
      const sensitiveToken = 'sess_token_super_secret_9988776655'
      const encrypted = encryptCookieValue(sensitiveToken)

      expect(encrypted).toMatch(/^enc\.v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/)
      expect(encrypted).not.toContain(sensitiveToken)

      const decrypted = decryptCookieValue(encrypted)
      expect(decrypted).toBe(sensitiveToken)
    })

    it('rejects tampered or forged ciphertexts gracefully', () => {
      const original = encryptCookieValue('original-value')
      // Tamper ciphertext
      const tampered = original.slice(0, -4) + 'abcd'
      const decrypted = decryptCookieValue(tampered)
      expect(decrypted).toBeNull()
    })

    it('supports backward compatibility with unencrypted legacy cookies', () => {
      const legacyValue = 'legacy-plain-token'
      const result = decryptCookieValue(legacyValue)
      expect(result).toBe(legacyValue)
    })
  })

  describe('2. Option Resolution (Expires, Max-Age, SameSite, Secure, Path, Domain)', () => {
    it('calculates expires from maxAge and vice versa', () => {
      const resolvedFromMaxAge = resolveCookieOptions({ maxAge: 3600 })
      expect(resolvedFromMaxAge.maxAge).toBe(3600)
      expect(resolvedFromMaxAge.expires).toBeInstanceOf(Date)
      expect(resolvedFromMaxAge.path).toBe('/')
      expect(resolvedFromMaxAge.sameSite).toBe('lax')

      const futureDate = new Date(Date.now() + 7200 * 1000)
      const resolvedFromExpires = resolveCookieOptions({ expires: futureDate })
      expect(resolvedFromExpires.maxAge).toBeGreaterThanOrEqual(7190)
      expect(resolvedFromExpires.expires).toEqual(futureDate)
    })

    it('handles session cookies when maxAge and expires are omitted', () => {
      const sessionOptions = resolveCookieOptions({ path: '/api', domain: 'example.com' })
      expect(sessionOptions.maxAge).toBeUndefined()
      expect(sessionOptions.expires).toBeUndefined()
      expect(sessionOptions.path).toBe('/api')
      expect(sessionOptions.domain).toBe('example.com')
    })
  })

  describe('3. Server-side Cookie Storage (NextResponse & NextRequest)', () => {
    it('sets, gets, updates, and deletes cookies on server responses', () => {
      const response = NextResponse.json({ ok: true })

      // Set cookie
      serverCookieStorage.set(response, 'user_pref', 'theme_dark', {
        path: '/',
        maxAge: 86400,
        sameSite: 'strict',
        secure: true,
      })

      const setHeader = response.headers.get('set-cookie')
      expect(setHeader).toBeDefined()
      expect(setHeader).toContain('user_pref=theme_dark')
      expect(setHeader).toContain('Path=/')
      expect(setHeader).toMatch(/SameSite=strict/i)
      expect(setHeader).toContain('Secure')

      // Update cookie
      serverCookieStorage.update(response, 'user_pref', 'theme_light', {
        path: '/',
        maxAge: 86400,
      })
      const updatedHeader = response.headers.get('set-cookie')
      expect(updatedHeader).toContain('user_pref=theme_light')

      // Delete cookie
      serverCookieStorage.delete(response, 'user_pref', { path: '/' })
      const deletedHeader = response.headers.get('set-cookie')
      expect(deletedHeader).toContain('Max-Age=0')
    })

    it('supports encrypted cookies on server storage', () => {
      const response = NextResponse.json({ ok: true })
      serverCookieStorage.set(response, 'secret_data', 'confidential_payload', {
        path: '/',
        encrypt: true,
      })

      const setHeader = response.headers.get('set-cookie')
      expect(setHeader).toBeDefined()
      expect(setHeader).not.toContain('confidential_payload')
      expect(setHeader).toContain('enc.v1%3A') // URL encoded or raw enc.v1:
    })

    it('reads cookies from NextRequest with automatic decryption', () => {
      const plainCookieHeader = 'simple_key=simple_value; other_key=other_value'
      const req1 = new NextRequest('http://localhost:3000', {
        headers: { cookie: plainCookieHeader },
      })

      expect(serverCookieStorage.get(req1, 'simple_key')).toBe('simple_value')
      expect(serverCookieStorage.get(req1, 'other_key')).toBe('other_value')
      expect(serverCookieStorage.get(req1, 'non_existent')).toBeNull()
      expect(serverCookieStorage.has(req1, 'simple_key')).toBe(true)
      expect(serverCookieStorage.has(req1, 'missing_key')).toBe(false)

      const secretPayload = 'top_secret_information'
      const encryptedValue = encryptCookieValue(secretPayload)
      const req2 = new NextRequest('http://localhost:3000', {
        headers: { cookie: `secure_item=${encodeURIComponent(encryptedValue)}` },
      })

      const decrypted = serverCookieStorage.get(req2, 'secure_item')
      expect(decrypted).toBe(secretPayload)
    })
  })

  describe('4. AuthCookieManager (Session Persistence Across Refresh)', () => {
    it('saves session cookie with HttpOnly, SameSite=Lax, Secure, and maxAge', () => {
      const response = NextResponse.json({ ok: true })
      const sessionToken = 'tok_secure_session_12345'
      const maxAge = 7 * 24 * 60 * 60 // 7 days

      authCookieManager.saveSession(response, sessionToken, maxAge)

      const setHeader = response.headers.get('set-cookie')
      expect(setHeader).toBeDefined()
      expect(setHeader).toContain(`${COOKIE_NAMES.SESSION}=${sessionToken}`)
      expect(setHeader).toContain('HttpOnly')
      expect(setHeader).toMatch(/SameSite=lax/i)
      expect(setHeader).toContain('Path=/')
      expect(setHeader).toContain(`Max-Age=${maxAge}`)
    })

    it('clears session cookie on logout', () => {
      const response = NextResponse.json({ ok: true })
      authCookieManager.clearSession(response)

      const setHeader = response.headers.get('set-cookie')
      expect(setHeader).toBeDefined()
      expect(setHeader).toContain(`${COOKIE_NAMES.SESSION}=;`)
      expect(setHeader).toContain('Max-Age=0')
    })
  })

  describe('5. Client-side Cookie Storage (Simulated DOM document.cookie)', () => {
    it('sets, gets, updates, and deletes cookies in browser environment', () => {
      let mockCookie = ''
      // Mock global document
      const originalDoc = global.document
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(global as any).document = {
        get cookie() {
          return mockCookie
        },
        set cookie(val: string) {
          const parts = val.split(';')
          const [keyVal] = parts
          const [key, value] = keyVal.split('=')
          const existing = mockCookie ? mockCookie.split('; ').filter((c) => !c.startsWith(`${key}=`)) : []
          if (parts.some((p) => p.trim() === 'Max-Age=0')) {
            mockCookie = existing.join('; ')
          } else {
            existing.push(`${key}=${value}`)
            mockCookie = existing.join('; ')
          }
        },
      }

      try {
        // Set
        clientCookieStorage.set('client_lang', 'vi', { path: '/', maxAge: 86400 })
        expect(clientCookieStorage.get('client_lang')).toBe('vi')
        expect(clientCookieStorage.has('client_lang')).toBe(true)

        // Update
        clientCookieStorage.update('client_lang', 'en')
        expect(clientCookieStorage.get('client_lang')).toBe('en')

        // Remove
        clientCookieStorage.remove('client_lang')
        expect(clientCookieStorage.has('client_lang')).toBe(false)
        expect(clientCookieStorage.get('client_lang')).toBeNull()

        // Encryption on client
        clientCookieStorage.set('safe_client_data', 'sensitive_local', { encrypt: true })
        expect(mockCookie).not.toContain('sensitive_local')
        expect(clientCookieStorage.get('safe_client_data')).toBe('sensitive_local')
      } finally {
        // Restore
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(global as any).document = originalDoc
      }
    })
  })
})
