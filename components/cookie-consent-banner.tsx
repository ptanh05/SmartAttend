'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { Cookie, ShieldCheck, Settings, ChevronDown, ChevronUp, X, Lock, Check } from 'lucide-react'
import { COOKIE_NAMES, clientCookieStorage } from '@/lib/storage/cookie-storage'
import { useI18n } from '@/components/i18n-provider'

export type CookieConsentValue = 'all' | 'necessary'

export interface CookiePreferences {
  necessary: boolean
  preferences: boolean
}

const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60 // 1 year

/**
 * Helper to dispatch event and trigger cookie settings dialog from anywhere in the app
 * (e.g. footer link "Cài đặt Cookie").
 */
export function openCookieSettings(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('smartattend:open-cookie-settings'))
  }
}

/**
 * Helper to inspect current user cookie consent state.
 */
export function getCookieConsent(): CookieConsentValue | null {
  if (typeof document === 'undefined') return null
  const val = clientCookieStorage.get(COOKIE_NAMES.CONSENT)
  if (val === 'all' || val === 'necessary') return val
  return null
}

const subscribeNoop = () => () => {}

export function CookieConsentBanner() {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )

  const [forceOpen, setForceOpen] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isCustomizing, setIsCustomizing] = useState(false)
  const [allowPreferences, setAllowPreferences] = useState(true)

  // Safe i18n hook
  let locale = 'vi'
  try {
    const i18n = useI18n()
    locale = i18n.locale
  } catch {
    locale = 'vi'
  }

  const isEn = locale === 'en'

  // Subscribe to external trigger (e.g., from footer "Cookie Settings" click)
  useEffect(() => {
    const handleOpenSettings = () => {
      setIsCustomizing(true)
      setForceOpen(true)
      setIsDismissed(false)
    }

    window.addEventListener('smartattend:open-cookie-settings', handleOpenSettings)
    return () => {
      window.removeEventListener('smartattend:open-cookie-settings', handleOpenSettings)
    }
  }, [])

  const saveConsent = (value: CookieConsentValue) => {
    clientCookieStorage.set(COOKIE_NAMES.CONSENT, value, {
      maxAge: CONSENT_MAX_AGE_SECONDS,
      path: '/',
      sameSite: 'lax',
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('smartattend:cookie-consent-changed', {
          detail: {
            consent: value,
            preferences: value === 'all',
          },
        }),
      )
    }

    setIsDismissed(true)
    setForceOpen(false)
    setIsCustomizing(false)
  }

  const handleAcceptAll = () => {
    setAllowPreferences(true)
    saveConsent('all')
  }

  const handleAcceptNecessary = () => {
    setAllowPreferences(false)
    saveConsent('necessary')
  }

  const handleSaveCustom = () => {
    saveConsent(allowPreferences ? 'all' : 'necessary')
  }

  // Prevent SSR hydration mismatch
  if (!isClient) {
    return null
  }

  // Check existing cookie
  const existingConsent = clientCookieStorage.get(COOKIE_NAMES.CONSENT)
  const shouldShow = (!existingConsent && !isDismissed) || forceOpen

  if (!shouldShow) {
    return null
  }

  return (
    <div
      role="region"
      aria-label={isEn ? 'Cookie Consent Notice' : 'Thông báo Chấp nhận Cookie'}
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-lg z-50 transition-all duration-300"
    >
      <div className="rounded-2xl border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-md text-card-foreground">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Cookie className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                {isEn ? 'Cookie & Privacy Preferences' : 'Quyền riêng tư & Quản lý Cookie'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isEn ? 'SmartAttend Security & Compliance' : 'Bảo mật & Trải nghiệm SmartAttend'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAcceptNecessary}
            aria-label={isEn ? 'Close cookie notice' : 'Đóng thông báo cookie'}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {isEn
            ? 'SmartAttend uses strictly necessary cookies (HttpOnly, SHA-256 encrypted session, CSRF tokens) to protect your account and verify attendance securely. You can also allow optional cookies to remember theme and device preferences.'
            : 'SmartAttend sử dụng cookie thiết yếu (phiên HttpOnly băm SHA-256, mã bảo vệ CSRF) nhằm đảm bảo an toàn tài khoản và xác thực điểm danh. Bạn có thể cho phép thêm cookie ghi nhớ cấu hình giao diện & thiết bị tin cậy.'}
        </p>

        {/* Detailed Customization Panel */}
        {isCustomizing && (
          <div className="mt-4 space-y-3 rounded-xl border border-border/80 bg-muted/40 p-3.5 text-xs">
            {/* Category 1: Strictly Necessary */}
            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{isEn ? 'Strictly Necessary Cookies' : 'Cookie Thiết yếu'}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <Lock className="h-2.5 w-2.5" />
                  {isEn ? 'Always Active' : 'Bắt buộc'}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {isEn
                  ? 'Essential for session integrity, authentication, and anti-fraud attendance verification (smartattend_session, smartattend_csrf). Cannot be disabled.'
                  : 'Bắt buộc để duy trì phiên làm việc, xác thực tài khoản và phòng chống gian lận điểm danh (smartattend_session, smartattend_csrf). Không thể vô hiệu hóa.'}
              </p>
            </div>

            {/* Category 2: Preferences & Personalization */}
            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <Settings className="h-4 w-4 text-primary" />
                  <span>{isEn ? 'Preferences & Experience' : 'Cá nhân hóa & Trải nghiệm'}</span>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={allowPreferences}
                    onChange={(e) => setAllowPreferences(e.target.checked)}
                    className="sr-only peer"
                    aria-label={isEn ? 'Enable preferences cookies' : 'Bật cookie cá nhân hóa'}
                  />
                  <div className="h-5 w-9 rounded-full bg-muted-foreground/30 peer-checked:bg-primary transition-colors after:absolute after:top-[2px] after:start-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {isEn
                  ? 'Remembers your preferred language, theme mode (dark/light), and trusted device recognition for seamless attendance (smartattend_theme, smartattend_locale, smartattend_device_id).'
                  : 'Ghi nhớ ngôn ngữ hiển thị, giao diện sáng/tối và nhận diện thiết bị tin cậy hỗ trợ điểm danh mượt mà (smartattend_theme, smartattend_locale, smartattend_device_id).'}
              </p>
            </div>
          </div>
        )}

        {/* Actions Button Group */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setIsCustomizing((prev) => !prev)}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline self-start cursor-pointer"
          >
            {isCustomizing ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                <span>{isEn ? 'Collapse details' : 'Thu gọn chi tiết'}</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                <span>{isEn ? 'Customize choices' : 'Tùy chỉnh chi tiết'}</span>
              </>
            )}
          </button>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {isCustomizing ? (
              <>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {isEn ? 'Accept All' : 'Chấp nhận tất cả'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveCustom}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isEn ? 'Save My Choice' : 'Lưu lựa chọn'}</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleAcceptNecessary}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  {isEn ? 'Necessary Only' : 'Chỉ cần thiết'}
                </button>
                <button
                  type="button"
                  onClick={handleAcceptAll}
                  className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors cursor-pointer"
                >
                  {isEn ? 'Accept All' : 'Chấp nhận tất cả'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
