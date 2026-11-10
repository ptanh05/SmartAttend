import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { COOKIE_NAMES, clientCookieStorage } from '@/lib/storage/cookie-storage'
import { getCookieConsent, openCookieSettings } from '@/components/cookie-consent-banner'

describe('Cookie Consent Banner and Helper Utilities', () => {
  let mockCookie = ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let originalDoc: any

  beforeEach(() => {
    mockCookie = ''
    originalDoc = global.document
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
  })

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(global as any).document = originalDoc
  })

  it('correctly reports getCookieConsent() when no consent cookie is present', () => {
    expect(getCookieConsent()).toBeNull()
  })

  it('returns "all" when smartattend_cookie_consent is set to all', () => {
    clientCookieStorage.set(COOKIE_NAMES.CONSENT, 'all', {
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
    })
    expect(getCookieConsent()).toBe('all')
  })

  it('returns "necessary" when smartattend_cookie_consent is set to necessary', () => {
    clientCookieStorage.set(COOKIE_NAMES.CONSENT, 'necessary', {
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
    })
    expect(getCookieConsent()).toBe('necessary')
  })

  it('returns null for unrecognized consent values', () => {
    clientCookieStorage.set(COOKIE_NAMES.CONSENT, 'unknown_value', {
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
      sameSite: 'lax',
    })
    expect(getCookieConsent()).toBeNull()
  })

  it('openCookieSettings triggers smartattend:open-cookie-settings custom event on window', () => {
    const handler = vi.fn()
    type CustomListener = (event: Event) => void
    const listeners: Record<string, CustomListener[]> = {}
    const originalWindow = global.window

    const mockWindow = {
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        listeners[type] = listeners[type] || []
        listeners[type].push(fn as CustomListener)
      },
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
        listeners[type] = (listeners[type] || []).filter((l) => l !== fn)
      },
      dispatchEvent: (event: Event) => {
        const fns = listeners[event.type] || []
        fns.forEach((fn) => fn(event))
        return true
      },
    }

    Object.defineProperty(global, 'window', {
      value: mockWindow,
      writable: true,
      configurable: true,
    })

    try {
      window.addEventListener('smartattend:open-cookie-settings', handler)
      openCookieSettings()
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
        configurable: true,
      })
    }
  })
})
